import { PrismaClient } from '@prisma/client';
import * as xlsx from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const p1 = await prisma.installment.findFirst({
    where: { negotiation: { contract: { contractNumber: 'CTR-3-27-8856' } }, installmentNumber: 1 },
    include: { payments: true }
  });
  console.log('Parcela 1:', JSON.stringify(p1, null, 2));

  // Verificar na planilha TECO
  const tecoPath = path.resolve(__dirname, '../../uploads/documents/PLANILHA_CONTROLE_CONTRATOS_TECO (1).xlsx');
  const wb = xlsx.readFile(tecoPath);
  for (const sName of wb.SheetNames) {
    const rows: any[][] = xlsx.utils.sheet_to_json(wb.Sheets[sName], { header: 1 });
    const matches = rows.filter(r => JSON.stringify(r).toUpperCase().includes('DAMIAO') || JSON.stringify(r).toUpperCase().includes('DAMIÃO') || JSON.stringify(r).toUpperCase().includes('33451427320') || (r[0] === 3 && r[1] === 27));
    if (matches.length > 0) {
      console.log(`\nMatch na planilha TECO (Aba ${sName}):`);
      matches.forEach(m => console.log(m));
    }
  }

  // Verificar no CONTROLE GERAL
  const ctrlPath = path.resolve(__dirname, '../../uploads/documents/CONTROLE GERAL - FINANCEIRO E DOCUMENTOS - REGULARIZAÇÃO DOS SETORES.xlsx');
  const wbCtrl = xlsx.readFile(ctrlPath);
  for (const sName of wbCtrl.SheetNames) {
    const rows: any[][] = xlsx.utils.sheet_to_json(wbCtrl.Sheets[sName], { header: 1 });
    const matches = rows.filter(r => JSON.stringify(r).toUpperCase().includes('DAMIAO') || JSON.stringify(r).toUpperCase().includes('DAMIÃO') || JSON.stringify(r).toUpperCase().includes('33451427320'));
    if (matches.length > 0) {
      console.log(`\nMatch no CONTROLE GERAL (Aba ${sName}):`);
      matches.forEach(m => console.log(m));
    }
  }

  // Verificar no extrato Asaas se tem algo dele
  const extPath = path.resolve(__dirname, '../../uploads/documents/Extrato_10-09-2026.xlsx');
  const wbExt = xlsx.readFile(extPath);
  const extRows: any[][] = xlsx.utils.sheet_to_json(wbExt.Sheets[wbExt.SheetNames[0]], { header: 1 });
  const extMatches = extRows.filter(r => JSON.stringify(r).toUpperCase().includes('DAMIAO') || JSON.stringify(r).toUpperCase().includes('DAMIÃO'));
  console.log(`\nMatches no Extrato Asaas:`, extMatches);
}

main().finally(() => prisma.$disconnect());
