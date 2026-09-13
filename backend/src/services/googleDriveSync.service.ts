import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma/client';

interface RegistryData {
  documents: Record<string, string>; // documentId -> driveFilePath
  lotFolders: Record<string, string>; // lotId -> driveFolderPath
}

export function getDriveBasePath(): string | null {
  const customPath = process.env.GOOGLE_DRIVE_PATH;
  const candidates = [
    customPath,
    'G:\\Meu Drive\\GENESIS_REURB',
    'G:/Meu Drive/GENESIS_REURB',
    'g:\\Meu Drive\\GENESIS_REURB',
    'g:/Meu Drive/GENESIS_REURB',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return path.resolve(candidate);
      }
    } catch {
      // Ignora erro de acesso
    }
  }

  return null;
}

export function getLotDrivePath(
  projectName: string,
  blockNumber: string,
  lotNumber: string,
  person?: { fullName?: string | null; cpf?: string | null } | null
): string {
  const basePath = getDriveBasePath() || 'G:\\Meu Drive\\GENESIS_REURB';
  const cleanProject = sanitizeFolderPart(projectName) || 'Projeto';
  const cleanBlock = sanitizeFolderPart(blockNumber) || '0';
  const lotFolder = buildLotFolderName(lotNumber, person);
  return path.join(basePath, cleanProject, `Quadra ${cleanBlock}`, lotFolder);
}

export function sanitizeFolderPart(name: string): string {
  if (!name) return '';
  return name
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '');
}

export function formatCpf(cpf?: string | null): string {
  if (!cpf) return '';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length === 11) {
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return sanitizeFolderPart(cpf);
}

function getRegistryPath(): string {
  const dir = path.resolve(process.cwd(), '../uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'drive_sync_registry.json');
}

function loadRegistry(): RegistryData {
  const regPath = getRegistryPath();
  try {
    if (fs.existsSync(regPath)) {
      const data = fs.readFileSync(regPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[GoogleDriveSync] Erro ao carregar registro de sincronização:', err);
  }
  return { documents: {}, lotFolders: {} };
}

function saveRegistry(registry: RegistryData): void {
  const regPath = getRegistryPath();
  try {
    fs.writeFileSync(regPath, JSON.stringify(registry, null, 2), 'utf8');
  } catch (err) {
    console.error('[GoogleDriveSync] Erro ao salvar registro de sincronização:', err);
  }
}

export function buildLotFolderName(
  lotNumber: string,
  person?: { fullName?: string | null; cpf?: string | null } | null
): string {
  const cleanLotNumber = sanitizeFolderPart(lotNumber) || 'SemNumero';
  if (!person || !person.fullName) {
    return `Lote ${cleanLotNumber} - Sem Titular`;
  }

  const cleanName = sanitizeFolderPart(person.fullName);
  const cleanCpf = formatCpf(person.cpf);

  if (cleanCpf) {
    return `Lote ${cleanLotNumber} - ${cleanName} - ${cleanCpf}`;
  }
  return `Lote ${cleanLotNumber} - ${cleanName}`;
}

export function resolveLocalUploadPath(fileName: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), '../uploads/documents', fileName),
    path.resolve(process.cwd(), 'uploads/documents', fileName),
    path.resolve(process.cwd(), '../uploads', fileName),
    path.resolve(process.cwd(), 'uploads', fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Determina o nome do arquivo a ser salvo na pasta do Google Drive.
 * - Remove prefixos residuais de bugs anteriores (ex: "Documento de identidade - ")
 * - Se o arquivo já possui um nome descritivo (ex: "CONTRATO DE COMPRA E VENDA FLAVIO.pdf", "RG FLAVIO.pdf",
 *   "COMPROVANTE DE RESIDENCIA FLAVIO.pdf"), preserva o nome original limpo sem adicionar prefixos redundantes.
 * - Se o arquivo tiver um nome genérico de digitalizador/câmera (ex: "scan001.pdf", "foto.jpg", "documento.pdf",
 *   "WhatsApp Image..."), adiciona o prefixo da categoria/tipo correspondente.
 */
export function buildDriveFileName(doc: {
  originalName: string;
  fileName: string;
  category?: string | null;
  documentType?: { name: string } | null;
}): string {
  const extension = path.extname(doc.originalName) || path.extname(doc.fileName) || '.pdf';
  let baseName = path.basename(doc.originalName, extension);

  // Remove qualquer prefixo legado ou incorreto de "Documento de identidade - "
  baseName = baseName.replace(/^Documento\s+de\s+identidade\s*-\s*/i, '').trim();

  const sanitizedBase = sanitizeFolderPart(baseName) || 'documento';
  const typeName = (doc.documentType?.name || doc.category || '').trim();
  const cleanTypeName = sanitizeFolderPart(typeName);

  // Padrões de arquivos genéricos gerados por scanners, câmeras ou downloads
  const isGeneric =
    /^(scan|doc|documento|arquivo|file|image|img|foto|anexo|download|upload)[_\-\s]*\d*$/i.test(sanitizedBase) ||
    /^whatsapp[_\-\s]?image.*$/i.test(sanitizedBase) ||
    /^\d+$/.test(sanitizedBase);

  if (isGeneric && cleanTypeName) {
    return `${cleanTypeName} - ${sanitizedBase}${extension}`;
  }

  return `${sanitizedBase}${extension}`;
}

/**
 * Sincroniza a adição de um documento para a pasta do Google Drive
 */
export async function syncDocumentAdded(documentId: string): Promise<string | null> {
  const basePath = getDriveBasePath();
  if (!basePath) {
    console.warn('[GoogleDriveSync] Drive G:\\Meu Drive\\GENESIS_REURB não está acessível no momento.');
    return null;
  }

  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
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

    if (!doc) {
      console.warn(`[GoogleDriveSync] Documento ${documentId} não encontrado no banco.`);
      return null;
    }

    const localFilePath = resolveLocalUploadPath(doc.fileName);
    if (!localFilePath) {
      console.warn(`[GoogleDriveSync] Arquivo físico ${doc.fileName} não encontrado no servidor.`);
      return null;
    }

    let targetDir = basePath;

    if (doc.lot) {
      const projectName = sanitizeFolderPart(doc.lot.project.name) || 'Projeto';
      const blockNumber = sanitizeFolderPart(doc.lot.block.number) || '0';
      const owner = doc.lot.occupancies[0]?.person || doc.person;
      const lotFolderName = buildLotFolderName(doc.lot.number, owner);

      targetDir = path.join(basePath, projectName, `Quadra ${blockNumber}`, lotFolderName);
    } else if (doc.person) {
      // Se não tem lote mas tem pessoa, verifica se ela ocupa algum lote
      const occupancy = await prisma.occupancy.findFirst({
        where: { personId: doc.person.id, current: true, type: 'OWNER' },
        include: {
          lot: {
            include: {
              project: true,
              block: true,
            },
          },
        },
      });

      if (occupancy?.lot) {
        const projectName = sanitizeFolderPart(occupancy.lot.project.name) || 'Projeto';
        const blockNumber = sanitizeFolderPart(occupancy.lot.block.number) || '0';
        const lotFolderName = buildLotFolderName(occupancy.lot.number, doc.person);
        targetDir = path.join(basePath, projectName, `Quadra ${blockNumber}`, lotFolderName);
      } else {
        const personFolderName = `${sanitizeFolderPart(doc.person.fullName)} - ${formatCpf(doc.person.cpf) || 'Sem CPF'}`;
        targetDir = path.join(basePath, 'Pessoas Sem Lote', personFolderName);
      }
    } else {
      targetDir = path.join(basePath, 'Documentos Gerais');
    }

    // Cria os diretórios necessários no Google Drive
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Formata o nome do arquivo final no Google Drive
    const extension = path.extname(doc.originalName) || path.extname(doc.fileName) || '.pdf';
    const finalFileName = buildDriveFileName(doc);
    const finalBaseName = path.basename(finalFileName, extension);

    let targetFilePath = path.join(targetDir, finalFileName);
    let counter = 1;

    // Se já existir arquivo com esse nome (e tamanho diferente), adiciona sufixo numérico
    while (fs.existsSync(targetFilePath)) {
      const existingStat = fs.statSync(targetFilePath);
      const sourceStat = fs.statSync(localFilePath);
      if (existingStat.size === sourceStat.size) {
        // Arquivo exatamente idêntico já existe
        break;
      }
      targetFilePath = path.join(
        targetDir,
        `${finalBaseName} (${counter})${extension}`
      );
      counter++;
    }

    // Copia o arquivo para a pasta do Google Drive
    fs.copyFileSync(localFilePath, targetFilePath);

    // Salva no registro
    const registry = loadRegistry();
    registry.documents[documentId] = targetFilePath;
    if (doc.lotId) {
      registry.lotFolders[doc.lotId] = targetDir;
    }
    saveRegistry(registry);

    console.log(`[GoogleDriveSync] Documento sincronizado com sucesso: ${targetFilePath}`);
    return targetFilePath;
  } catch (error) {
    console.error('[GoogleDriveSync] Erro ao sincronizar documento adicionado:', error);
    return null;
  }
}

/**
 * Remove o arquivo correspondente da pasta do Google Drive quando um documento é excluído
 */
export async function syncDocumentDeleted(documentId: string): Promise<boolean> {
  const basePath = getDriveBasePath();
  if (!basePath) return false;

  try {
    const registry = loadRegistry();
    const driveFilePath = registry.documents[documentId];

    if (driveFilePath && fs.existsSync(driveFilePath)) {
      try {
        fs.unlinkSync(driveFilePath);
        console.log(`[GoogleDriveSync] Documento excluído do Google Drive: ${driveFilePath}`);
      } catch (err) {
        console.error(`[GoogleDriveSync] Falha ao excluir arquivo físico no Drive: ${driveFilePath}`, err);
      }
    }

    delete registry.documents[documentId];
    saveRegistry(registry);
    return true;
  } catch (error) {
    console.error('[GoogleDriveSync] Erro ao processar exclusão de documento:', error);
    return false;
  }
}

/**
 * Atualiza o nome da pasta do lote no Google Drive quando o titular ou lote for alterado.
 * Preserva todos os arquivos existentes dentro da pasta, renomeando-a de forma atômica.
 */
export async function syncLotOwnerChanged(lotId: string): Promise<string | null> {
  const basePath = getDriveBasePath();
  if (!basePath) return null;

  try {
    const lot = await prisma.lot.findUnique({
      where: { id: lotId },
      include: {
        project: true,
        block: true,
        occupancies: {
          where: { current: true, type: 'OWNER' },
          include: { person: true },
        },
      },
    });

    if (!lot) return null;

    const projectName = sanitizeFolderPart(lot.project.name) || 'Projeto';
    const blockNumber = sanitizeFolderPart(lot.block.number) || '0';
    const owner = lot.occupancies[0]?.person;

    const quadraDir = path.join(basePath, projectName, `Quadra ${blockNumber}`);
    const newLotFolderName = buildLotFolderName(lot.number, owner);
    const newLotFolderPath = path.join(quadraDir, newLotFolderName);

    // Se a pasta da quadra não existe, cria
    if (!fs.existsSync(quadraDir)) {
      fs.mkdirSync(quadraDir, { recursive: true });
    }

    const registry = loadRegistry();
    const recordedOldPath = registry.lotFolders[lotId];

    // Procura por qualquer pasta existente desta quadra que pertença a este lote
    let existingOldPath: string | null = null;

    if (recordedOldPath && fs.existsSync(recordedOldPath)) {
      existingOldPath = recordedOldPath;
    } else if (fs.existsSync(quadraDir)) {
      const entries = fs.readdirSync(quadraDir, { withFileTypes: true });
      const cleanLotNum = sanitizeFolderPart(lot.number);
      const prefixRegex = new RegExp(`^Lote\\s+${cleanLotNum}(\\s+-\\s+.*)?$`, 'i');

      for (const entry of entries) {
        if (entry.isDirectory() && prefixRegex.test(entry.name)) {
          existingOldPath = path.join(quadraDir, entry.name);
          break;
        }
      }
    }

    if (existingOldPath && existingOldPath !== newLotFolderPath) {
      if (fs.existsSync(existingOldPath)) {
        fs.renameSync(existingOldPath, newLotFolderPath);
        console.log(`[GoogleDriveSync] Pasta do lote renomeada: "${existingOldPath}" -> "${newLotFolderPath}"`);

        // Atualiza os caminhos no registro de documentos deste lote
        for (const [docId, docPath] of Object.entries(registry.documents)) {
          if (docPath.startsWith(existingOldPath)) {
            registry.documents[docId] = docPath.replace(existingOldPath, newLotFolderPath);
          }
        }
      }
    } else if (!fs.existsSync(newLotFolderPath)) {
      // Se não existia pasta anterior, cria a nova
      fs.mkdirSync(newLotFolderPath, { recursive: true });
    }

    registry.lotFolders[lotId] = newLotFolderPath;
    saveRegistry(registry);

    return newLotFolderPath;
  } catch (error) {
    console.error('[GoogleDriveSync] Erro ao atualizar pasta do lote no Drive:', error);
    return null;
  }
}

/**
 * Quando os dados de uma pessoa (nome ou CPF) forem alterados,
 * atualiza todas as pastas de lotes onde ela é a titular atual.
 */
export async function syncPersonUpdated(personId: string): Promise<void> {
  try {
    const occupancies = await prisma.occupancy.findMany({
      where: { personId, current: true, type: 'OWNER' },
      select: { lotId: true },
    });

    for (const occ of occupancies) {
      await syncLotOwnerChanged(occ.lotId);
    }
  } catch (error) {
    console.error('[GoogleDriveSync] Erro ao sincronizar alteração de dados da pessoa:', error);
  }
}

/**
 * Sincroniza todos os documentos existentes no banco de dados para o Google Drive
 */
export async function syncAllDrive(): Promise<{ total: number; synced: number; errors: number }> {
  const basePath = getDriveBasePath();
  if (!basePath) {
    throw new Error('Unidade Google Drive (G:\\Meu Drive\\GENESIS_REURB) não encontrada.');
  }

  const documents = await prisma.document.findMany({
    select: { id: true },
  });

  let synced = 0;
  let errors = 0;

  for (const doc of documents) {
    try {
      const res = await syncDocumentAdded(doc.id);
      if (res) synced++;
      else errors++;
    } catch {
      errors++;
    }
  }

  return { total: documents.length, synced, errors };
}

/**
 * Cria todas as pastas de todos os projetos, quadras e lotes cadastrados no banco
 * e sincroniza todos os documentos existentes.
 */
export async function generateAllFoldersAndSync(): Promise<{
  projectsCount: number;
  blocksCount: number;
  lotsCount: number;
  documentsSynced: number;
}> {
  const basePath = getDriveBasePath();
  if (!basePath) {
    throw new Error('Unidade Google Drive (G:\\Meu Drive\\GENESIS_REURB) não encontrada.');
  }

  const projects = await prisma.project.findMany({
    include: {
      blocks: {
        include: {
          lots: {
            include: {
              occupancies: {
                where: { current: true, type: 'OWNER' },
                include: { person: true },
              },
            },
          },
        },
      },
    },
  });

  let blocksCount = 0;
  let lotsCount = 0;

  for (const project of projects) {
    const projectName = sanitizeFolderPart(project.name) || 'Projeto';
    const projectDir = path.join(basePath, projectName);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    for (const block of project.blocks) {
      blocksCount++;
      const blockNumber = sanitizeFolderPart(block.number) || '0';
      const blockDir = path.join(projectDir, `Quadra ${blockNumber}`);
      if (!fs.existsSync(blockDir)) {
        fs.mkdirSync(blockDir, { recursive: true });
      }

      for (const lot of block.lots) {
        lotsCount++;
        const owner = lot.occupancies[0]?.person;
        const lotFolderName = buildLotFolderName(lot.number, owner);
        const lotDir = path.join(blockDir, lotFolderName);
        if (!fs.existsSync(lotDir)) {
          fs.mkdirSync(lotDir, { recursive: true });
        }
      }
    }
  }

  // Sincroniza todos os documentos existentes
  const syncResult = await syncAllDrive();

  return {
    projectsCount: projects.length,
    blocksCount,
    lotsCount,
    documentsSynced: syncResult.synced,
  };
}


