import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const templateCandidates = [
  path.resolve(__dirname, '../../../uploads/documents/contrato-modelo.docx'),
  path.resolve(__dirname, '../../uploads/documents/contrato-modelo.docx'),
  path.resolve(process.cwd(), '../uploads/documents/contrato-modelo.docx'),
  path.resolve(process.cwd(), 'uploads/documents/contrato-modelo.docx'),
];

function xmlText(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function replaceAcrossRuns(xml: string, oldValue: string, newValue: string) {
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    const matches = [...paragraph.matchAll(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g)];
    if (!matches.length) return paragraph;
    const texts = matches.map((match) => xmlText(match[2]));
    const combined = texts.join('');
    const start = combined.indexOf(oldValue);
    if (start < 0) return paragraph;

    const end = start + oldValue.length;
    let output = paragraph;
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const match = matches[index];
      const matchIndex = match.index!;
      const matchLength = match[0].length;

      const nodeStart = texts.slice(0, index).join('').length;
      const nodeEnd = nodeStart + texts[index].length;
      if (nodeEnd <= start || nodeStart >= end) continue;
      const localStart = Math.max(start - nodeStart, 0);
      const localEnd = Math.min(end - nodeStart, texts[index].length);
      let replacement = texts[index].slice(0, localStart) + (nodeStart <= start ? newValue : '') + texts[index].slice(localEnd);
      if (nodeStart > start) replacement = texts[index].slice(0, localStart) + texts[index].slice(localEnd);
      const newNode = `<w:t${match[1]}>${escapeXml(replacement)}</w:t>`;
      output = output.slice(0, matchIndex) + newNode + output.slice(matchIndex + matchLength);
    }
    return output;
  });
}

function formatCpf(cpf: string) {
  if (!cpf) return '';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length === 11) {
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cpf;
}

function formatPhone(phone: string) {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 11) {
    return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (clean.length === 10) {
    return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return phone;
}

export function createContractDocument(data: {
  sector: string;
  name: string;
  cpf: string;
  phone: string;
  maritalStatus?: string;
  spouseName?: string;
  spouseCpf?: string;
  blockNumber?: string;
  lotNumber?: string;
}) {
  const templatePath = templateCandidates.find((candidate) => fs.existsSync(candidate));
  if (!templatePath) throw new Error('Modelo de contrato não encontrado.');
  const zip = new AdmZip(templatePath);
  const documentEntry = zip.getEntry('word/document.xml');
  if (!documentEntry) throw new Error('O modelo de contrato está inválido.');

  const formattedCpf = formatCpf(data.cpf);
  const formattedSpouseCpf = formatCpf(data.spouseCpf || '');
  const formattedPhone = formatPhone(data.phone);

  let xml = documentEntry.getData().toString('utf8');

  // 1. Substituição dos titulares fixos do modelo (Raissa Custodio Saldanha / Amilton João da Silva)
  xml = replaceAcrossRuns(xml, 'RAISSA CUSTODIO SALDANHA,', `${data.name},`);
  xml = replaceAcrossRuns(xml, 'RAISSA CUSTODIO SALDANHA', data.name);
  xml = replaceAcrossRuns(xml, 'AMILTON JOÃO DA SILVA,', `${data.name},`);
  xml = replaceAcrossRuns(xml, 'AMILTON JOÃO DA SILVA', data.name);
  xml = replaceAcrossRuns(xml, '052.125.932-04', formattedCpf);
  xml = replaceAcrossRuns(xml, '013.280.011-05', formattedCpf);
  xml = replaceAcrossRuns(xml, '66 8470-2856', formattedPhone || '');
  xml = replaceAcrossRuns(xml, '66 98403-1176', '');

  // 2. Montagem da qualificação civil e familiar limpa
  let marital = data.maritalStatus?.trim() || 'solteiro(a)';
  if (/casad/i.test(marital)) marital = 'casado(a)';
  else if (/solteir/i.test(marital)) marital = 'solteiro(a)';
  else if (/divorciad/i.test(marital)) marital = 'divorciado(a)';
  else if (/viu/i.test(marital)) marital = 'viúvo(a)';
  else if (/uni[aã]o/i.test(marital)) marital = 'em união estável';

  let spouseSnippet = '';
  if (data.spouseName?.trim()) {
    const spouseDoc = formattedSpouseCpf ? ` (inscrito(a) no CPF sob nº ${formattedSpouseCpf})` : '';
    if (/casad/i.test(marital)) {
      spouseSnippet = `, casado(a) com ${data.spouseName.trim()}${spouseDoc}`;
    } else {
      spouseSnippet = `, convivente em união estável com ${data.spouseName.trim()}${spouseDoc}`;
    }
  } else {
    spouseSnippet = `, ${marital}`;
  }

  const phoneSnippet = formattedPhone ? `, telefone nº ${formattedPhone}` : '';

  // Trata 'convivente com doravante' dependendo de ter cônjuge ou não
  if (data.spouseName?.trim()) {
    const spouseInfo = `, casado(a)/convivente com ${data.spouseName.trim()}${formattedSpouseCpf ? ` (CPF nº ${formattedSpouseCpf})` : ''}, doravante`;
    xml = replaceAcrossRuns(xml, ', convivente com  doravante', spouseInfo);
    xml = replaceAcrossRuns(xml, ', convivente com doravante', spouseInfo);
    xml = replaceAcrossRuns(xml, 'convivente com  doravante', spouseInfo.replace(/^, /, ''));
    xml = replaceAcrossRuns(xml, 'convivente com doravante', spouseInfo.replace(/^, /, ''));
  } else {
    xml = replaceAcrossRuns(xml, ', convivente com  doravante', ', doravante');
    xml = replaceAcrossRuns(xml, ', convivente com doravante', ', doravante');
    xml = replaceAcrossRuns(xml, 'convivente com  doravante', 'doravante');
    xml = replaceAcrossRuns(xml, 'convivente com doravante', 'doravante');
  }

  // Limpeza de telefone
  if (!formattedPhone) {
    xml = replaceAcrossRuns(xml, ', proTelefone n° %telefone%', '');
    xml = replaceAcrossRuns(xml, ', pro Telefone n° %telefone%', '');
    xml = replaceAcrossRuns(xml, 'proTelefone n° %telefone%', '');
    xml = replaceAcrossRuns(xml, 'pro Telefone n° %telefone%', '');
    xml = replaceAcrossRuns(xml, ', telefone n° Não informado', '');
    xml = replaceAcrossRuns(xml, ', telefone nº Não informado', '');
    xml = replaceAcrossRuns(xml, 'telefone n° Não informado', '');
  } else {
    xml = replaceAcrossRuns(xml, 'proTelefone', 'telefone');
    xml = replaceAcrossRuns(xml, 'pro Telefone', 'telefone');
  }

  // 3. Substituições de Variáveis de Titular (com e sem espaços)
  for (const t of ['%nometitular%', '% nometitular %', '%NOMETITULAR%', '% NOMETITULAR %']) {
    xml = replaceAcrossRuns(xml, t, data.name);
  }
  for (const t of ['%cpf%', '% cpf %', '%CPF%', '% CPF %']) {
    xml = replaceAcrossRuns(xml, t, formattedCpf);
  }
  for (const t of ['%telefone%', '% telefone %', '%TELEFONE%', '% TELEFONE %']) {
    xml = replaceAcrossRuns(xml, t, formattedPhone || 'Não informado');
  }
  for (const t of ['%estadocivil%', '% estadocivil %', '%ESTADOCIVIL%', '% ESTADOCIVIL %']) {
    xml = replaceAcrossRuns(xml, t, marital);
  }

  // 4. Cônjuge
  for (const t of ['%nomeconjuge%', '% nomeconjuge %', '%NOMECONJUGE%', '% NOMECONJUGE %']) {
    xml = replaceAcrossRuns(xml, t, data.spouseName || '');
  }
  for (const t of ['%cpfconjuge%', '% cpfconjuge %', '%CPFCONJUGE%', '% CPFCONJUGE %']) {
    xml = replaceAcrossRuns(xml, t, formattedSpouseCpf);
  }

  // 5. Lote e Quadra
  for (const t of ['%qd%', '% qd %', '%QD%', '% QD %']) {
    xml = replaceAcrossRuns(xml, t, data.blockNumber || '');
  }
  for (const t of ['%lt%', '% lt %', '%LT%', '% LT %']) {
    xml = replaceAcrossRuns(xml, t, data.lotNumber || '');
  }

  // 6. Setor / Bairro
  xml = replaceAcrossRuns(xml, 'Bairro Dardanelos', `Bairro ${data.sector}`);
  xml = replaceAcrossRuns(xml, 'Dardanelos', data.sector);

  // 7. Data por extenso
  const now = new Date();
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  for (const t of ['%dia%', '% dia %', '%DIA%', '% DIA %']) {
    xml = replaceAcrossRuns(xml, t, String(now.getDate()).padStart(2, '0'));
  }
  for (const t of ['%mes%', '% mes %', '%MES%', '% MES %']) {
    xml = replaceAcrossRuns(xml, t, meses[now.getMonth()]);
  }
  for (const t of ['%ano%', '% ano %', '%ANO%', '% ANO %']) {
    xml = replaceAcrossRuns(xml, t, String(now.getFullYear()));
  }

  zip.updateFile('word/document.xml', Buffer.from(xml, 'utf8'));
  return zip.toBuffer();
}