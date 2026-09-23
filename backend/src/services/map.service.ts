import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma/client';

export interface LotFinancialSummary {
  totalInstallments: number;
  paidInstallments: number;
  overdueInstallments: number;
  pendingInstallments: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  nextDueDate: string | null;
}

export interface EnrichedLotData {
  id: string;
  number: string;
  blockId: string;
  blockNumber: string;
  address: string | null;
  area: number | null;
  perimeter: number | null;
  registration: string | null;
  status: string;
  occupant: {
    id?: string;
    name: string;
    cpf: string | null;
    phone: string | null;
  } | null;
  contract: {
    id: string;
    contractNumber: string;
    signed: boolean;
    signedAt: string | null;
    status: string;
    totalValue: number;
  } | null;
  financial: LotFinancialSummary;
}

export interface ProjectMapStats {
  contractual: {
    signed: number;
    notSigned: number;
    distrato: number;
    unlinked: number;
    total: number;
  };
  financial: {
    paid: number;
    upToDate: number;
    overdue: number;
    noCharges: number;
    unlinked: number;
    total: number;
  };
}

// Maps project ID or normalized name to folder in uploads/mapasinterativos
function resolveMapFolder(projectId: string, projectName: string): string | null {
  const baseDir = path.resolve(__dirname, '../../../uploads/mapasinterativos');
  if (!fs.existsSync(baseDir)) return null;

  // Direct project ID match
  const directPath = path.join(baseDir, projectId);
  if (fs.existsSync(directPath)) return directPath;

  // Vila Nova mapping
  if (projectId === 'project-vila-nova-aripuana' || projectName.toLowerCase().includes('vila nova')) {
    const vilaNovaPath = path.join(baseDir, 'vila_nova');
    if (fs.existsSync(vilaNovaPath)) return vilaNovaPath;
  }

  // Normalized name match
  const normalized = projectName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_');

  const normalizedPath = path.join(baseDir, normalized);
  if (fs.existsSync(normalizedPath)) return normalizedPath;

  return null;
}

export async function getProjectMapData(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      neighborhood: true,
      city: true,
      state: true,
      status: true,
      blocks: {
        where: { active: true },
        select: { id: true, number: true },
        orderBy: { number: 'asc' }
      }
    }
  });

  if (!project) {
    throw new Error('Projeto não encontrado');
  }

  const mapFolder = resolveMapFolder(project.id, project.name);

  // Fetch all lots in database for this project
  const dbLots = await prisma.lot.findMany({
    where: { projectId: project.id, active: true },
    include: {
      block: true,
      occupancies: {
        where: { current: true },
        include: { person: true }
      },
      contracts: {
        include: {
          person: true,
          negotiations: {
            include: {
              installments: true
            }
          }
        }
      }
    },
    orderBy: [
      { block: { number: 'asc' } },
      { number: 'asc' }
    ]
  });

  // Calculate lot data and build lookup by geographicFile
  const lotByFeatureId = new Map<string, EnrichedLotData>();
  const linkedFeatureIds = new Set<string>();

  const availableLotsForLinking = dbLots
    .filter(l => !l.geographicFile)
    .map(l => ({
      id: l.id,
      number: l.number,
      blockId: l.blockId,
      blockNumber: l.block.number,
      status: l.status,
      occupantName: l.occupancies[0]?.person?.fullName || null
    }));

  for (const lot of dbLots) {
    let occupant = null;
    if (lot.occupancies.length > 0 && lot.occupancies[0].person) {
      occupant = {
        id: lot.occupancies[0].person.id,
        name: lot.occupancies[0].person.fullName,
        cpf: lot.occupancies[0].person.cpf,
        phone: lot.occupancies[0].person.phone || lot.occupancies[0].person.whatsapp
      };
    }

    const activeContract = lot.contracts[0] || null;
    let contractData = null;
    const installments: Array<{
      status: string;
      amount: number;
      paidAmount: number;
      dueDate: Date;
    }> = [];

    if (activeContract) {
      contractData = {
        id: activeContract.id,
        contractNumber: activeContract.contractNumber,
        signed: activeContract.signed,
        signedAt: activeContract.signedAt ? activeContract.signedAt.toISOString() : null,
        status: activeContract.status,
        totalValue: activeContract.totalValue
      };

      for (const neg of activeContract.negotiations) {
        for (const inst of neg.installments) {
          installments.push({
            status: inst.status,
            amount: inst.amount,
            paidAmount: inst.paidAmount,
            dueDate: new Date(inst.dueDate)
          });
        }
      }
    }

    const now = new Date();
    let paidInstallments = 0;
    let overdueInstallments = 0;
    let pendingInstallments = 0;
    let totalAmount = 0;
    let paidAmount = 0;
    let nextDueDate: string | null = null;

    for (const inst of installments) {
      totalAmount += inst.amount;
      paidAmount += inst.paidAmount;

      if (inst.status === 'PAID') {
        paidInstallments++;
      } else if (inst.status === 'OVERDUE' || (inst.status === 'PENDING' && inst.dueDate < now)) {
        overdueInstallments++;
      } else if (inst.status === 'PENDING') {
        pendingInstallments++;
        if (!nextDueDate || inst.dueDate < new Date(nextDueDate)) {
          nextDueDate = inst.dueDate.toISOString();
        }
      }
    }

    const enrichedLot: EnrichedLotData = {
      id: lot.id,
      number: lot.number,
      blockId: lot.blockId,
      blockNumber: lot.block.number,
      address: lot.address,
      area: lot.area,
      perimeter: lot.perimeter,
      registration: lot.registration,
      status: lot.status,
      occupant,
      contract: contractData,
      financial: {
        totalInstallments: installments.length,
        paidInstallments,
        overdueInstallments,
        pendingInstallments,
        totalAmount: Math.round(totalAmount * 100) / 100,
        paidAmount: Math.round(paidAmount * 100) / 100,
        remainingAmount: Math.round(Math.max(0, totalAmount - paidAmount) * 100) / 100,
        nextDueDate
      }
    };

    if (lot.geographicFile) {
      lotByFeatureId.set(lot.geographicFile, enrichedLot);
      linkedFeatureIds.add(lot.geographicFile);
    }
  }

  if (!mapFolder) {
    return {
      project,
      hasMap: false,
      hasAerialImage: false,
      message: 'Planta interativa ainda não configurada para este projeto.',
      dbLotsCount: dbLots.length,
      availableLotsForLinking
    };
  }

  // Check aerial tiles
  const tilesDir = path.join(mapFolder, 'tiles');
  const hasAerialImage = fs.existsSync(tilesDir);

  // Check GeoJSON file (prefer base_mapa_clean.geojson if present)
  let geojsonFile = path.join(mapFolder, 'base_mapa_clean.geojson');
  if (!fs.existsSync(geojsonFile)) {
    geojsonFile = path.join(mapFolder, 'base_mapa.geojson');
  }

  if (!fs.existsSync(geojsonFile)) {
    return {
      project,
      hasMap: false,
      hasAerialImage,
      message: 'Arquivo de planta vetorial (GeoJSON) não encontrado.',
      dbLotsCount: dbLots.length,
      availableLotsForLinking
    };
  }

  const rawGeojson = fs.readFileSync(geojsonFile, 'utf8');
  const geojson = JSON.parse(rawGeojson);

  const stats: ProjectMapStats = {
    contractual: {
      signed: 0,
      notSigned: 0,
      distrato: 0,
      unlinked: 0,
      total: 0
    },
    financial: {
      paid: 0,
      upToDate: 0,
      overdue: 0,
      noCharges: 0,
      unlinked: 0,
      total: 0
    }
  };

  // Enrich features with DB lot status
  for (const feature of geojson.features) {
    const fid = feature.id || feature.properties?.featureId;
    const isLot = feature.properties?.type === 'lot' || (feature.properties?.areaM2 >= 30 && feature.properties?.areaM2 <= 2000);

    const linkedLot = fid ? lotByFeatureId.get(fid) : null;

    if (linkedLot) {
      feature.properties.lotId = linkedLot.id;
      feature.properties.lotNumber = linkedLot.number;
      feature.properties.blockNumber = linkedLot.blockNumber;
      feature.properties.label = `Q${linkedLot.blockNumber} - L${linkedLot.number}`;
      feature.properties.lotData = linkedLot;

      // Contractual status
      if (linkedLot.status === 'CONTRACT_SIGNED') {
        feature.properties.statusContract = 'CONTRACT_SIGNED';
        if (isLot) stats.contractual.signed++;
      } else if (linkedLot.status === 'DISTRATTO') {
        feature.properties.statusContract = 'DISTRATTO';
        if (isLot) stats.contractual.distrato++;
      } else {
        feature.properties.statusContract = 'NOT_SIGNED';
        if (isLot) stats.contractual.notSigned++;
      }

      // Financial status
      if (linkedLot.financial.totalInstallments === 0) {
        feature.properties.statusFinancial = 'NO_CHARGES';
        if (isLot) stats.financial.noCharges++;
      } else if (linkedLot.financial.overdueInstallments > 0) {
        feature.properties.statusFinancial = 'OVERDUE';
        if (isLot) stats.financial.overdue++;
      } else if (linkedLot.financial.paidInstallments === linkedLot.financial.totalInstallments) {
        feature.properties.statusFinancial = 'PAID';
        if (isLot) stats.financial.paid++;
      } else {
        feature.properties.statusFinancial = 'UP_TO_DATE';
        if (isLot) stats.financial.upToDate++;
      }
    } else {
      feature.properties.lotId = null;
      feature.properties.lotData = null;
      feature.properties.statusContract = 'UNLINKED';
      feature.properties.statusFinancial = 'UNLINKED';
      if (isLot) {
        stats.contractual.unlinked++;
        stats.financial.unlinked++;
      }
    }

    if (isLot) {
      stats.contractual.total++;
      stats.financial.total++;
    }
  }

  const folderName = path.basename(mapFolder);

  return {
    project,
    hasMap: true,
    hasAerialImage,
    projectSlug: folderName,
    tileUrlTemplate: `/api/map/tiles/${folderName}/{z}/{x}/{y}.jpg`,
    crs: geojson.crs?.properties?.name || 'EPSG:31981',
    metadata: geojson.metadata || {
      utmOrigin: [231402.5559573, 8868054.0190441],
      utmMaxY: 8871330.8190441,
      baseResolution: 12.8,
      tileSize: 256,
      bounds: {
        minX: 231402.5559573,
        minY: 8869656.2052522,
        maxX: 233131.0919187,
        maxY: 8871330.8190441
      }
    },
    stats,
    dbLotsCount: dbLots.length,
    linkedLotsCount: linkedFeatureIds.size,
    availableLotsForLinking,
    geojson
  };
}

export async function linkLotToGeometry(projectId: string, lotId: string, featureId: string) {
  const lot = await prisma.lot.findFirst({
    where: { id: lotId, projectId }
  });

  if (!lot) {
    throw new Error('Lote não encontrado no projeto especificado');
  }

  // If another lot was linked to this feature, remove link first
  await prisma.lot.updateMany({
    where: { projectId, geographicFile: featureId },
    data: { geographicFile: null }
  });

  // Link this lot
  const updated = await prisma.lot.update({
    where: { id: lotId },
    data: { geographicFile: featureId },
    include: {
      block: true,
      occupancies: {
        where: { current: true },
        include: { person: true }
      },
      contracts: {
        include: {
          person: true,
          negotiations: {
            include: { installments: true }
          }
        }
      }
    }
  });

  return updated;
}

export async function unlinkLotGeometry(projectId: string, featureId: string) {
  const updated = await prisma.lot.updateMany({
    where: { projectId, geographicFile: featureId },
    data: { geographicFile: null }
  });

  return updated;
}

export function getTileFilePath(projectSlug: string, z: string, x: string, y: string): string | null {
  const baseDir = path.resolve(__dirname, '../../../uploads/mapasinterativos');
  // Sanitize path params to prevent path traversal
  const safeSlug = path.basename(projectSlug);
  const safeZ = path.basename(z);
  const safeX = path.basename(x);
  const safeY = path.basename(y);

  // 1. Direct path check
  const tilePath = path.join(baseDir, safeSlug, 'tiles', safeZ, safeX, `${safeY}.jpg`);
  if (fs.existsSync(tilePath)) {
    return tilePath;
  }

  // 2. TMS Y fallback check (invert Y: (1 << z) - 1 - y)
  const numZ = parseInt(safeZ, 10);
  const numY = parseInt(safeY, 10);
  if (!isNaN(numZ) && !isNaN(numY) && numZ >= 0 && numZ <= 10) {
    const invertedY = (1 << numZ) - 1 - numY;
    const invPath = path.join(baseDir, safeSlug, 'tiles', safeZ, safeX, `${invertedY}.jpg`);
    if (fs.existsSync(invPath)) {
      return invPath;
    }
  }

  return null;
}

