const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Never connect these tests to the application's real database.
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'regression-test-secret-only-do-not-use-in-production';
process.env.ASAAS_WEBHOOK_TOKEN = 'regression-webhook-token';
require('ts-node/register/transpile-only');
const jwt = require('jsonwebtoken');
const { prisma } = require('../src/prisma/client');
const { dashboardSummary } = require('../src/utils/dashboardSummary');
const { isApprovedAndValid } = require('../src/utils/documentChecklist');
const { jwtSecret } = require('../src/utils/security');
const app = require('../src/app').default;
let server, base;
let currentUser;
const user = () => ({ id: 'test-user', role: 'ADMIN', email: 'test@example.com', active: true, updatedAt: new Date('2026-01-01T00:00:00Z') });
const token = (extra = {}) => jwt.sign({ userId: 'test-user', role: 'ADMIN', ...extra }, process.env.JWT_SECRET, { expiresIn: '5m' });
const auth = () => ({ Authorization: `Bearer ${token()}` });
const originals = [];
function mock(object, key, value) { originals.push([object, key, object[key]]); object[key] = value; }
before(async () => {
  currentUser = user();
  mock(prisma.user, 'findUnique', async () => currentUser);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { for (const [object, key, value] of originals.reverse()) object[key] = value; await new Promise(resolve => server.close(resolve)); await prisma.$disconnect(); });

test('no public download and no refresh token accepted as access token', async () => {
  assert.equal((await fetch(base + '/uploads/documents/missing')).status, 401);
  const refresh = jwt.sign({ userId: 'test-user' }, process.env.JWT_SECRET);
  assert.equal((await fetch(base + '/uploads/documents/missing', { headers: { Authorization: `Bearer ${refresh}` } })).status, 401);
});
test('disabled and deleted users immediately lose access', async () => {
  currentUser = { ...user(), active: false };
  assert.equal((await fetch(base + '/api/finance/accounts', { headers: auth() })).status, 401);
  currentUser = null;
  assert.equal((await fetch(base + '/api/finance/accounts', { headers: auth() })).status, 401);
  currentUser = user();
});
test('changed user version revokes a newly issued session', async () => {
  const headers = { Authorization: `Bearer ${token({ userVersion: '2025-01-01T00:00:00.000Z' })}` };
  assert.equal((await fetch(base + '/api/finance/accounts', { headers })).status, 401);
});
test('CONSULTA cannot change finance, documents, people or contracts, even with an old ADMIN token', async () => {
  currentUser = { ...user(), role: 'CONSULTA' };
  for (const [method, endpoint] of [['POST','/api/finance/payments'], ['PUT','/api/finance/installments/example'], ['DELETE','/api/expenses/example'], ['POST','/api/people'], ['POST','/api/contracts'], ['PATCH','/api/documents/example/status']]) {
    assert.equal((await fetch(base + endpoint, { method, headers: auth() })).status, 403, endpoint);
  }
  currentUser = user();
});
test('financial role keeps access to payment validation; attendant cannot change payments', async () => {
  currentUser = { ...user(), role: 'FINANCEIRO' };
  // Empty input reaches validation, without writing to the database.
  assert.equal((await fetch(base + '/api/finance/payments', { method: 'POST', headers: auth() })).status, 400);
  currentUser = { ...user(), role: 'ATENDENTE' };
  assert.equal((await fetch(base + '/api/finance/payments', { method: 'POST', headers: auth() })).status, 403);
  currentUser = user();
});
test('webhook rejects absent/wrong tokens and accepts a correct token for payload validation', async () => {
  for (const received of ['', 'incorrect']) assert.equal((await fetch(base + '/api/finance/asaas/webhook', { method: 'POST', headers: { 'asaas-access-token': received } })).status, 401);
  assert.equal((await fetch(base + '/api/finance/asaas/webhook', { method: 'POST', headers: { 'asaas-access-token': process.env.ASAAS_WEBHOOK_TOKEN } })).status, 400);
  const previous = process.env.ASAAS_WEBHOOK_TOKEN;
  delete process.env.ASAAS_WEBHOOK_TOKEN;
  assert.equal((await fetch(base + '/api/finance/asaas/webhook', { method: 'POST' })).status, 503);
  process.env.ASAAS_WEBHOOK_TOKEN = previous;
});
test('registered files download after login with original filename and no public caching', async () => {
  const filename = 'regression-' + randomUUID();
  const localPath = path.resolve('../uploads/documents', filename);
  fs.writeFileSync(localPath, 'test document');
  mock(prisma.document, 'findFirst', async ({ where }) => where.filePath.endsWith(filename) ? { originalName: 'documento-teste.pdf' } : null);
  mock(prisma.expenseAttachment, 'findFirst', async () => null);
  mock(prisma.payment, 'findFirst', async () => null);
  mock(prisma.profitWithdrawal, 'findFirst', async () => null);
  try {
    const response = await fetch(base + '/uploads/documents/' + filename, { headers: auth() });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), /attachment.*documento-teste.pdf/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(await response.text(), 'test document');
    assert.equal((await fetch(base + '/uploads/documents/unregistered', { headers: auth() })).status, 404);
    assert.equal((await fetch(base + '/uploads/documents/..%5Csecret', { headers: auth() })).status, 404);
  } finally { fs.unlinkSync(localPath); }
});
test('only approved, unexpired documents fulfill the checklist', () => {
  const now = new Date('2026-09-14T18:00:00Z');
  for (const status of ['PENDING','UNDER_REVIEW','REJECTED','EXPIRED','ILLEGIBLE','NOT_APPLICABLE']) assert.equal(isApprovedAndValid({ status }, now), false, status);
  assert.equal(isApprovedAndValid({ status: 'APPROVED' }, now), true);
  assert.equal(isApprovedAndValid({ status: 'APPROVED', expirationDate: new Date('2026-09-13') }, now), false);
  assert.equal(isApprovedAndValid({ status: 'APPROVED', expirationDate: new Date('2026-09-14') }, now), true);
});
test('dossier recognizes the existing categories and distinguishes sent from approved', async () => {
  const categories = ['RG/CPF ou CNH do Titular','Certidão de Casamento ou Nascimento','Comprovante de Residência','Contrato de Compra e Venda','Contrato de Prestação de Serviços'];
  const documents = categories.map(category => ({ category, status: 'APPROVED', expirationDate: null }));
  const fixture = { id: 'lot', number: '1', project: { id: 'project', name: 'Teste' }, block: { id: 'block', number: '1' }, occupancies: [{ person: { id: 'owner', fullName: 'Teste', maritalStatus: 'SOLTEIRO', spouse: null } }], documents };
  let query;
  mock(prisma.lot, 'findMany', async args => { query = args; return [fixture]; });
  let result = await (await fetch(base + '/api/documents/dossiers?search=Maria', { headers: auth() })).json();
  assert.equal(result.data.dossiers[0].status, 'COMPLETE');
  assert.equal(JSON.stringify(query).includes('"contains":""'), false);
  documents[0].status = 'REJECTED';
  result = await (await fetch(base + '/api/documents/dossiers', { headers: auth() })).json();
  assert.equal(result.data.dossiers[0].status, 'PENDING');
  assert.equal(result.data.dossiers[0].checklist[0].hasDoc, true);
  assert.equal(result.data.dossiers[0].checklist[0].isComplete, false);
  documents[0].category = 'Documento do Cônjuge';
  documents[0].status = 'APPROVED';
  result = await (await fetch(base + '/api/documents/dossiers', { headers: auth() })).json();
  assert.equal(result.data.dossiers[0].checklist[0].isComplete, false);
});
test('dashboard uses actual payments and partial balances, excludes cancellations, and handles year boundaries', () => {
  const now = new Date('2026-02-14T12:00:00Z');
  const payments = [{ amount: 0.1, paymentDate: new Date('2026-02-01') }, { amount: 0.2, paymentDate: new Date('2026-02-02') }, { amount: 100, paymentDate: new Date('2025-01-01') }];
  const installments = [{ amount: 100, paidAmount: 25, status: 'PARTIALLY_PAID', dueDate: new Date('2026-02-01') }, { amount: 50, paidAmount: 0, status: 'PENDING', dueDate: new Date('2026-02-14') }, { amount: 1000, paidAmount: 0, status: 'CANCELED', dueDate: new Date('2026-02-01') }];
  const result = dashboardSummary(payments, installments, now);
  assert.deepEqual(result.financialSummary, { received: 100.3, outstanding: 125, overdue: 75 });
  assert.equal(result.overdueCount, 1);
  assert.equal(result.financeData.length, 6);
  assert.equal(result.financeData[5].received, 0.3);
  assert.equal(result.financeData[5].due, 125);
  assert.equal(dashboardSummary([], [], now).financialSummary.received, 0);
});
test('missing or placeholder JWT secret never falls back to a public value', () => {
  const previous = process.env.JWT_SECRET;
  for (const value of ['', 'secret', 'replace_with_secure_secret']) { process.env.JWT_SECRET = value; assert.throws(jwtSecret); }
  process.env.JWT_SECRET = previous;
});
test('disabled users cannot log in', async () => {
  currentUser = { ...user(), active: false };
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'test@example.com', password: 'test-password' }) });
  assert.equal(response.status, 401);
  currentUser = user();
});
