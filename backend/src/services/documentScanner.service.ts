import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { prisma } from '../prisma/client';
import { syncDocumentAdded } from './googleDriveSync.service';

export interface ExtractedDocumentData {
  documentType: string;
  confidence: number;
  cpf: string | null;
  rg: string | null;
  rgIssuer: string | null;
  name: string | null;
  birthDate: string | null;
  motherName: string | null;
  fatherName: string | null;
  notes: string | null;
  rawText?: string;
}

export interface MatchedEntity {
  person: {
    id: string;
    fullName: string;
    cpf: string | null;
    rg: string | null;
    phone: string | null;
  } | null;
  lot: {
    id: string;
    number: string;
    blockId: string;
    blockNumber: string;
    projectId: string;
    projectName: string;
  } | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  matchReason: string | null;
}

// Helper to validate Brazilian CPF checksum
export function isValidCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i), 10) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i), 10) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10), 10)) return false;

  return true;
}

// Clean and normalize text
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

// Extracts structured Brazilian document data from raw OCR text
export function extractEntitiesFromText(rawText: string): ExtractedDocumentData {
  const cleanText = rawText || '';
  const upper = normalizeText(cleanText);

  // 1. CPF extraction
  let cpf: string | null = null;
  const cpfRegex = /\b(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\s]?\d{2})\b/g;
  let match: RegExpExecArray | null;
  while ((match = cpfRegex.exec(cleanText)) !== null) {
    const candidate = match[1].replace(/\D/g, '');
    if (isValidCPF(candidate)) {
      cpf = candidate.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      break;
    }
  }

  // 2. RG extraction
  let rg: string | null = null;
  let rgIssuer: string | null = null;
  const rgMatch = upper.match(/(?:REGISTRO GERAL|IDENTIDADE|RG|DOC(?:\.|\s)?IDENTIDADE)[\s:]*([0-9\.\-\s]{6,14}[0-9X])/);
  if (rgMatch && rgMatch[1]) {
    rg = rgMatch[1].replace(/[^\dX]/gi, '').trim();
  } else {
    // Fallback: search for numbers like 12.345.678-9 or 1234567-8
    const altRg = cleanText.match(/\b(\d{1,2}\.?\d{3}\.?\d{3}[-\s]?[0-9X])\b/i);
    if (altRg && altRg[1] && (!cpf || !altRg[1].includes(cpf.substring(0, 5)))) {
      rg = altRg[1].replace(/\s+/g, '').trim();
    }
  }

  // Orgão emissor
  const issuerMatch = upper.match(/\b(SSP|PC|DETRAN|SESP|POLICIA CIVIL|SDS|SJS|DIC|SEJUSP)[\s\/\-]*(MT|RO|AC|AM|PA|MS|GO|DF|PR|SC|RS|SP|RJ|MG|ES|BA|PE|CE|MA|PI|RN|PB|AL|SE|TO|AP|RR)\b/);
  if (issuerMatch) {
    rgIssuer = `${issuerMatch[1]}/${issuerMatch[2]}`;
  }

  // 3. Name extraction
  let name: string | null = null;
  const nameLabelMatch = upper.match(/(?:NOME|TITULAR|NOME DO PORTADOR)[\s:]+([A-Z\s]{4,60})/);
  if (nameLabelMatch && nameLabelMatch[1]) {
    const candidate = nameLabelMatch[1].split('\n')[0].trim();
    if (candidate.length > 3 && !candidate.includes('FILIACAO') && !candidate.includes('REGISTRO')) {
      name = candidate;
    }
  }

  // 4. Birth Date extraction
  let birthDate: string | null = null;
  const dateRegex = /\b(0[1-9]|[12]\d|3[01])[\/\.\s](0[1-9]|1[0-2])[\/\.\s](19\d{2}|20\d{2})\b/g;
  const dateMatches: string[] = [];
  while ((match = dateRegex.exec(cleanText)) !== null) {
    dateMatches.push(`${match[1]}/${match[2]}/${match[3]}`);
  }
  if (dateMatches.length > 0) {
    // Usually birth date is the earliest or following "NASCIMENTO"
    const nascIndex = upper.indexOf('NASCIMENTO');
    if (nascIndex !== -1) {
      const nearNasc = cleanText.substring(nascIndex, nascIndex + 60);
      const nearMatch = nearNasc.match(/\b(0[1-9]|[12]\d|3[01])[\/\.\s](0[1-9]|1[0-2])[\/\.\s](19\d{2}|20\d{2})\b/);
      if (nearMatch) birthDate = `${nearMatch[1]}/${nearMatch[2]}/${nearMatch[3]}`;
    }
    if (!birthDate) birthDate = dateMatches[0];
  }

  // 5. Parent names (filiação)
  let motherName: string | null = null;
  let fatherName: string | null = null;
  const filiacaoMatch = upper.match(/(?:FILIACAO|FILIAÇÃO|MAE|PAI)[\s:]+([A-Z\s\n]{5,100})/);
  if (filiacaoMatch && filiacaoMatch[1]) {
    const lines = filiacaoMatch[1].split('\n').map(l => l.trim()).filter(l => l.length > 3);
    if (lines.length >= 1) motherName = lines[0];
    if (lines.length >= 2) fatherName = lines[1];
  }

  // 6. Classification heuristics
  let documentType = 'Outros Documentos';
  let confidence = 0.5;

  if (upper.includes('HABILITACAO') || upper.includes('CNH') || upper.includes('CARTEIRA NACIONAL') || upper.includes('RENACH')) {
    documentType = 'RG/CPF ou CNH do Titular';
    confidence = 0.95;
  } else if (upper.includes('REGISTRO GERAL') || upper.includes('CARTEIRA DE IDENTIDADE') || upper.includes('INSTITUTO DE IDENTIFICACAO') || upper.includes('REPUBLICA FEDERATIVA DO BRASIL')) {
    documentType = 'RG/CPF ou CNH do Titular';
    confidence = 0.92;
  } else if (upper.includes('CASAMENTO') || upper.includes('CERTIDAO DE CASAMENTO')) {
    documentType = 'Certidão de Casamento ou Nascimento';
    confidence = 0.95;
  } else if (upper.includes('NASCIMENTO') && upper.includes('REGISTRO CIVIL')) {
    documentType = 'Certidão de Casamento ou Nascimento';
    confidence = 0.90;
  } else if (upper.includes('ENERGISA') || upper.includes('ENERGIA') || upper.includes('AGUA') || upper.includes('RESIDENCIA') || upper.includes('FATURA') || upper.includes('COMPROVANTE')) {
    documentType = 'Comprovante de Residência';
    confidence = 0.88;
  } else if (upper.includes('COMPRA E VENDA') || upper.includes('PROMITENTE') || upper.includes('COMPROMISSO DE COMPRA')) {
    documentType = 'Contrato de Compra e Venda do Lote';
    confidence = 0.92;
  } else if (upper.includes('ADESAO') || upper.includes('REURB') || upper.includes('REGULARIZACAO FUNDIARIA')) {
    documentType = 'Contrato / Termo de Adesão REURB';
    confidence = 0.94;
  } else if (upper.includes('CADEIA DOMINIAL') || upper.includes('ANTERIORES')) {
    documentType = 'Sequência de Contrato (Cadeia Dominial)';
    confidence = 0.85;
  }

  return {
    documentType,
    confidence,
    cpf,
    rg,
    rgIssuer,
    name,
    birthDate,
    motherName,
    fatherName,
    notes: cleanText.substring(0, 300),
    rawText: cleanText
  };
}

// Reverse search in database for matching person and lots
export async function findMatchesInDatabase(extracted: ExtractedDocumentData): Promise<MatchedEntity> {
  const cleanCpf = extracted.cpf ? extracted.cpf.replace(/\D/g, '') : null;

  // 1. Search by exact CPF
  if (cleanCpf) {
    const person = await prisma.person.findFirst({
      where: {
        OR: [
          { cpf: cleanCpf },
          { cpf: extracted.cpf! }
        ]
      },
      include: {
        occupancies: {
          where: { current: true, type: 'OWNER' },
          include: {
            lot: {
              include: {
                block: true,
                project: true
              }
            }
          }
        }
      }
    });

    if (person) {
      const activeOccupancy = person.occupancies[0] || null;
      const lot = activeOccupancy?.lot || null;

      return {
        person: {
          id: person.id,
          fullName: person.fullName,
          cpf: person.cpf,
          rg: person.rg,
          phone: person.phone || person.whatsapp
        },
        lot: lot ? {
          id: lot.id,
          number: lot.number,
          blockId: lot.blockId,
          blockNumber: lot.block.number,
          projectId: lot.projectId,
          projectName: lot.project.name
        } : null,
        confidence: 'HIGH',
        matchReason: `CPF correspondente (${extracted.cpf}) encontrado no cadastro`
      };
    }
  }

  // 2. Search by RG
  if (extracted.rg) {
    const cleanRg = extracted.rg.replace(/[^\dX]/gi, '');
    const person = await prisma.person.findFirst({
      where: {
        OR: [
          { rg: { contains: cleanRg, mode: 'insensitive' } },
          { rg: { contains: extracted.rg, mode: 'insensitive' } }
        ]
      },
      include: {
        occupancies: {
          where: { current: true, type: 'OWNER' },
          include: {
            lot: {
              include: {
                block: true,
                project: true
              }
            }
          }
        }
      }
    });

    if (person) {
      const activeOccupancy = person.occupancies[0] || null;
      const lot = activeOccupancy?.lot || null;

      return {
        person: {
          id: person.id,
          fullName: person.fullName,
          cpf: person.cpf,
          rg: person.rg,
          phone: person.phone || person.whatsapp
        },
        lot: lot ? {
          id: lot.id,
          number: lot.number,
          blockId: lot.blockId,
          blockNumber: lot.block.number,
          projectId: lot.projectId,
          projectName: lot.project.name
        } : null,
        confidence: 'MEDIUM',
        matchReason: `RG correspondente (${extracted.rg}) encontrado no cadastro`
      };
    }
  }

  // 3. Search by Name if length > 6
  if (extracted.name && extracted.name.trim().length > 6) {
    const cleanName = extracted.name.trim();
    const person = await prisma.person.findFirst({
      where: {
        fullName: { contains: cleanName, mode: 'insensitive' }
      },
      include: {
        occupancies: {
          where: { current: true, type: 'OWNER' },
          include: {
            lot: {
              include: {
                block: true,
                project: true
              }
            }
          }
        }
      }
    });

    if (person) {
      const activeOccupancy = person.occupancies[0] || null;
      const lot = activeOccupancy?.lot || null;

      return {
        person: {
          id: person.id,
          fullName: person.fullName,
          cpf: person.cpf,
          rg: person.rg,
          phone: person.phone || person.whatsapp
        },
        lot: lot ? {
          id: lot.id,
          number: lot.number,
          blockId: lot.blockId,
          blockNumber: lot.block.number,
          projectId: lot.projectId,
          projectName: lot.project.name
        } : null,
        confidence: 'MEDIUM',
        matchReason: `Nome similar (${person.fullName}) encontrado no cadastro`
      };
    }
  }

  return {
    person: null,
    lot: null,
    confidence: 'NONE',
    matchReason: null
  };
}

// Stitches multiple scanned images (e.g. Front & Back of RG or multi-page docs) into a single A4 PDF
export async function createPdfFromImages(
  imagePaths: string[],
  outputPath: string,
  docTitle = 'Documento Escaneado - Gênesis REURB'
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ autoFirstPage: false, margin: 20 });
      const writeStream = fs.createWriteStream(outputPath);

      doc.pipe(writeStream);

      // A4 page size in points: 595.28 x 841.89
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 25;
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;

      // If exactly 2 images (e.g. Front & Back of RG/CNH), place both on a single clean A4 sheet!
      if (imagePaths.length === 2) {
        doc.addPage({ size: 'A4', margin });
        doc.fontSize(12).text(docTitle, margin, margin, { align: 'center' });
        doc.moveDown(0.5);

        const slotHeight = (printableHeight - 40) / 2;

        try {
          doc.image(imagePaths[0], margin, margin + 30, {
            fit: [printableWidth, slotHeight - 10],
            align: 'center',
            valign: 'center'
          });
          doc.image(imagePaths[1], margin, margin + 30 + slotHeight, {
            fit: [printableWidth, slotHeight - 10],
            align: 'center',
            valign: 'center'
          });
        } catch {
          // Fallback if image fit fails
          for (let i = 0; i < imagePaths.length; i++) {
            if (i > 0) doc.addPage({ size: 'A4', margin });
            doc.image(imagePaths[i], margin, margin, { fit: [printableWidth, printableHeight] });
          }
        }
      } else {
        // Multi-page document (1 image per page)
        for (const imgPath of imagePaths) {
          doc.addPage({ size: 'A4', margin });
          try {
            doc.image(imgPath, margin, margin, {
              fit: [printableWidth, printableHeight],
              align: 'center',
              valign: 'center'
            });
          } catch (imgErr) {
            console.warn('[DocumentScanner] Could not embed image into PDF:', imgPath, imgErr);
          }
        }
      }

      doc.end();

      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

// Saves scanned files and creates the document record in database
export async function saveScannedDocumentBundle({
  files,
  userId,
  lotId,
  personId,
  documentTypeId,
  category,
  notes,
  updatePersonData,
  extractedData,
  compileToPdf = true
}: {
  files: Express.Multer.File[];
  userId: string;
  lotId?: string;
  personId?: string;
  documentTypeId?: string;
  category?: string;
  notes?: string;
  updatePersonData?: boolean;
  extractedData?: ExtractedDocumentData;
  compileToPdf?: boolean;
}) {
  if (!files || files.length === 0) {
    throw new Error('Nenhum arquivo enviado para o escaneamento.');
  }

  const uploadDir = path.resolve(__dirname, '../../../uploads/documents');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Resolve category and document type
  let resolvedDocTypeId = documentTypeId || null;
  const categoryName = category || extractedData?.documentType || 'Documento Pessoal';

  if (!resolvedDocTypeId) {
    const existingType = await prisma.documentType.findFirst({
      where: {
        active: true,
        OR: [
          { name: { equals: categoryName, mode: 'insensitive' } },
          { category: { equals: categoryName, mode: 'insensitive' } }
        ]
      }
    });

    if (existingType) {
      resolvedDocTypeId = existingType.id;
    } else {
      const newType = await prisma.documentType.create({
        data: {
          name: categoryName,
          category: categoryName,
          active: true,
          required: false
        }
      });
      resolvedDocTypeId = newType.id;
    }
  }

  // Auto-detect person from lot if not specified
  let resolvedPersonId = personId || null;
  if (!resolvedPersonId && lotId) {
    const occupancy = await prisma.occupancy.findFirst({
      where: { lotId, current: true, type: 'OWNER' },
      select: { personId: true }
    });
    resolvedPersonId = occupancy?.personId || null;
  }

  // Optionally update Person's cadastral data if extracted
  if (updatePersonData && resolvedPersonId && extractedData) {
    const person = await prisma.person.findUnique({ where: { id: resolvedPersonId } });
    if (person) {
      const updateData: any = {};
      const cleanExtractedCpf = extractedData.cpf ? extractedData.cpf.replace(/\D/g, '') : null;

      if (cleanExtractedCpf && !person.cpf) {
        updateData.cpf = cleanExtractedCpf;
      }
      if (extractedData.rg && !person.rg) {
        updateData.rg = extractedData.rg;
      }
      if (extractedData.rgIssuer && !person.rgIssuer) {
        updateData.rgIssuer = extractedData.rgIssuer;
      }
      if (extractedData.birthDate && !person.birthDate) {
        const [d, m, y] = extractedData.birthDate.split('/');
        if (d && m && y) {
          const parsed = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
          if (!isNaN(parsed.getTime())) updateData.birthDate = parsed;
        }
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.person.update({
          where: { id: resolvedPersonId },
          data: updateData
        });
      }
    }
  }

  let finalFileName = files[0].filename;
  let finalOriginalName = files[0].originalname;
  let finalMimeType = files[0].mimetype;
  let finalSize = files[0].size;
  let finalFilePath = `/uploads/documents/${finalFileName}`;

  // If multiple images are uploaded and compileToPdf is requested, stitch them into a single PDF
  if (files.length > 1 && compileToPdf) {
    const timestamp = Date.now();
    const pdfFileName = `scan_bundle_${timestamp}.pdf`;
    const pdfFullPath = path.join(uploadDir, pdfFileName);
    const imagePaths = files.map(f => f.path);

    try {
      await createPdfFromImages(
        imagePaths,
        pdfFullPath,
        `${categoryName} - Gênesis REURB`
      );

      const stats = fs.statSync(pdfFullPath);
      finalFileName = pdfFileName;
      finalOriginalName = `${categoryName}_unificado.pdf`;
      finalMimeType = 'application/pdf';
      finalSize = stats.size;
      finalFilePath = `/uploads/documents/${pdfFileName}`;
    } catch (pdfErr) {
      console.warn('[DocumentScanner] Could not stitch to PDF, saving first file:', pdfErr);
    }
  }

  // Combine notes
  const notesParts: string[] = [];
  if (notes?.trim()) notesParts.push(notes.trim());
  if (extractedData?.cpf) notesParts.push(`CPF lido: ${extractedData.cpf}`);
  if (extractedData?.rg) notesParts.push(`RG lido: ${extractedData.rg}`);
  if (extractedData?.name) notesParts.push(`Nome lido: ${extractedData.name}`);
  if (files.length > 1) notesParts.push(`Captura em ${files.length} páginas/faces.`);

  // Create Document record in Prisma
  const document = await prisma.document.create({
    data: {
      personId: resolvedPersonId,
      lotId: lotId || null,
      documentTypeId: resolvedDocTypeId,
      category: categoryName,
      notes: notesParts.join(' | ') || null,
      originalName: finalOriginalName,
      fileName: finalFileName,
      filePath: finalFilePath,
      mimeType: finalMimeType,
      size: finalSize,
      status: 'APPROVED', // Field scanned documents with review
      uploadedById: userId
    },
    include: {
      person: { select: { id: true, fullName: true, cpf: true } },
      lot: { include: { block: true, project: true } },
      documentType: true,
      uploadedBy: { select: { id: true, name: true } }
    }
  });

  // Sync to Google Drive in background
  syncDocumentAdded(document.id).catch(err => {
    console.warn('[DocumentScanner] Google Drive sync warning:', err);
  });

  return document;
}

