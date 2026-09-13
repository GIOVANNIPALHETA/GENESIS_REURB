import fs from 'fs';
import path from 'path';
import { prisma } from '../src/prisma/client';
import { buildDriveFileName } from '../src/services/googleDriveSync.service';

const REGISTRY_PATH = path.resolve(process.cwd(), '../uploads/drive_sync_registry.json');
const ALT_REGISTRY_PATH = path.resolve(process.cwd(), 'uploads/drive_sync_registry.json');

function getRegistryFilePath(): string {
  if (fs.existsSync(REGISTRY_PATH)) return REGISTRY_PATH;
  if (fs.existsSync(ALT_REGISTRY_PATH)) return ALT_REGISTRY_PATH;
  return REGISTRY_PATH;
}

function loadRegistry(): { documents: Record<string, string>; lotFolders: Record<string, string> } {
  const filePath = getRegistryFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return { documents: {}, lotFolders: {} };
    }
  }
  return { documents: {}, lotFolders: {} };
}

function saveRegistry(registry: { documents: Record<string, string>; lotFolders: Record<string, string> }) {
  const filePath = getRegistryFilePath();
  fs.writeFileSync(filePath, JSON.stringify(registry, null, 2), 'utf-8');
}

async function getOrCreateDocType(name: string, category: string) {
  let docType = await prisma.documentType.findFirst({
    where: {
      active: true,
      OR: [
        { name: { equals: name, mode: 'insensitive' } },
        { category: { equals: category, mode: 'insensitive' } },
      ],
    },
  });

  if (!docType) {
    docType = await prisma.documentType.create({
      data: {
        name,
        category,
        active: true,
        required: false,
      },
    });
    console.log(`[+] Created DocumentType: "${name}" (${category})`);
  }
  return docType;
}

async function main() {
  console.log('--- Starting Document Types & Drive Renaming Fix ---');

  // Ensure standard document types exist
  const typeMap: Record<string, { name: string; category: string }> = {
    'RG/CPF ou CNH do Titular': { name: 'RG/CPF ou CNH do Titular', category: 'Pessoal' },
    'Documento do Cônjuge': { name: 'Documento do Cônjuge', category: 'Pessoal' },
    'Certidão de Casamento ou Nascimento': { name: 'Certidão de Casamento ou Nascimento', category: 'Civil' },
    'Comprovante de Residência': { name: 'Comprovante de Residência', category: 'Residência' },
    'Contrato de Compra e Venda': { name: 'Contrato de Compra e Venda', category: 'Posse' },
    'Sequência de Contrato': { name: 'Sequência de Contrato', category: 'Posse' },
    'Contrato de Prestação de Serviços': { name: 'Contrato de Prestação de Serviços', category: 'Jurídico' },
    'Documentos Complementares': { name: 'Documentos Complementares', category: 'Complementar' },
    'Outros': { name: 'Outros Documentos', category: 'Geral' },
  };

  const dbTypes: Record<string, any> = {};
  for (const [key, val] of Object.entries(typeMap)) {
    dbTypes[key] = await getOrCreateDocType(val.name, val.category);
  }

  // Fetch all documents
  const docs = await prisma.document.findMany({
    include: {
      documentType: true,
      person: true,
      lot: {
        include: {
          project: true,
          block: true,
          occupancies: {
            where: { current: true, type: 'OWNER' },
            include: { person: true },
          },
        },
      },
    },
  });

  console.log(`Found ${docs.length} documents in database.`);
  const registry = loadRegistry();

  for (const doc of docs) {
    let targetCategory = doc.category || 'Geral';
    
    // Check original name to identify category if it was incorrectly classified
    const origLower = doc.originalName.toLowerCase();
    if (origLower.includes('compra e venda')) {
      targetCategory = 'Contrato de Compra e Venda';
    } else if (origLower.includes('comprovante') || origLower.includes('residencia')) {
      targetCategory = 'Comprovante de Residência';
    } else if (origLower.includes('cnh') && origLower.includes('esposa')) {
      targetCategory = 'Documento do Cônjuge';
    } else if (origLower.includes('rg') || origLower.includes('cnh') || origLower.includes('cpf')) {
      targetCategory = 'RG/CPF ou CNH do Titular';
    }

    const correctType = dbTypes[targetCategory] || (await getOrCreateDocType(targetCategory, targetCategory));

    // Update document in database
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        category: targetCategory,
        documentTypeId: correctType.id,
      },
    });

    console.log(`Updated Doc ${doc.id}: category="${targetCategory}", type="${correctType.name}"`);

    // Now check file on Google Drive
    const cleanFileName = buildDriveFileName({
      originalName: doc.originalName,
      fileName: doc.fileName,
      category: targetCategory,
      documentType: correctType,
    });

    const registeredPath = registry.documents[doc.id];
    if (registeredPath && fs.existsSync(registeredPath)) {
      const currentDir = path.dirname(registeredPath);
      const currentFileName = path.basename(registeredPath);
      const newPath = path.join(currentDir, cleanFileName);

      if (currentFileName !== cleanFileName) {
        // Rename in Google Drive
        if (fs.existsSync(newPath) && newPath !== registeredPath) {
          console.log(`Target path already exists: ${newPath}, removing duplicate old file: ${registeredPath}`);
          fs.unlinkSync(registeredPath);
        } else {
          fs.renameSync(registeredPath, newPath);
          console.log(`Renamed Drive File:\n  FROM: ${registeredPath}\n  TO:   ${newPath}`);
        }
        registry.documents[doc.id] = newPath;
      }
    }
  }

  saveRegistry(registry);
  console.log('--- Finished Fix Successfully ---');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

