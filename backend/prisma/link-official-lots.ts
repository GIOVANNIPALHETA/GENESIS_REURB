import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('🔗 [INÍCIO] Vinculação oficial da malha limpa aos lotes do banco...');

  const geojsonPath = path.resolve(__dirname, '../../uploads/mapasinterativos/vila_nova/base_mapa_clean.geojson');
  if (!fs.existsSync(geojsonPath)) {
    throw new Error('Arquivo base_mapa_clean.geojson não encontrado.');
  }

  const raw = fs.readFileSync(geojsonPath, 'utf8');
  const geojson = JSON.parse(raw);
  const lotFeatures = geojson.features.filter((f: any) => f.properties?.type === 'lot');

  console.log(`🗺️ Polígonos de lotes encontrados no GeoJSON: ${lotFeatures.length}`);

  const project = await prisma.project.findFirst({
    where: { OR: [{ id: 'project-vila-nova-aripuana' }, { name: { contains: 'Vila Nova' } }] },
    include: {
      lots: {
        include: {
          block: true,
          contracts: { include: { person: true } },
          occupancies: { include: { person: true } }
        }
      }
    }
  });

  if (!project) throw new Error('Projeto Vila Nova não encontrado no banco.');
  console.log(`📁 Projeto localizado: ${project.name} (${project.id})`);
  console.log(`📦 Lotes no banco: ${project.lots.length}`);

  let linkedCount = 0;
  const linkedFeatureIds = new Set<string>();

  for (const dbLot of project.lots) {
    const normBlock = dbLot.block.number.replace(/^0+/, '').trim().toUpperCase();
    const normLot = dbLot.number.replace(/^0+/, '').trim().toUpperCase();

    // 1. Procura match exato de Quadra e Lote
    let foundFeature = lotFeatures.find((f: any) => {
      const fBlock = String(f.properties?.dbBlockNumber || f.properties?.blockNumber || '').replace(/^0+/, '').trim().toUpperCase();
      const fLot = String(f.properties?.lotNumber || '').replace(/^0+/, '').trim().toUpperCase();
      return fBlock === normBlock && fLot === normLot && !linkedFeatureIds.has(f.id);
    });

    // 2. Se não achar e for sublote (ex: 18-A, 18-B, 27-B, 5-B), tenta pelo número base
    if (!foundFeature) {
      const baseMatch = normLot.match(/^(\d+)/);
      if (baseMatch) {
        const baseNum = baseMatch[1];
        foundFeature = lotFeatures.find((f: any) => {
          const fBlock = String(f.properties?.dbBlockNumber || f.properties?.blockNumber || '').replace(/^0+/, '').trim().toUpperCase();
          const fLot = String(f.properties?.lotNumber || '').replace(/^0+/, '').trim().toUpperCase();
          return fBlock === normBlock && fLot === baseNum && !linkedFeatureIds.has(f.id);
        });
      }
    }

    if (foundFeature) {
      await prisma.lot.update({
        where: { id: dbLot.id },
        data: { geographicFile: foundFeature.id }
      });
      linkedFeatureIds.add(foundFeature.id);
      linkedCount++;

      const occupantName = dbLot.occupancies[0]?.person?.fullName || dbLot.contracts[0]?.person?.fullName || 'Sem titular';
      console.log(`  ✅ Lote Q${dbLot.block.number}-L${dbLot.number} vinculado a ${foundFeature.id} (${occupantName})`);
    } else {
      console.log(`  ⚠️ Lote Q${dbLot.block.number}-L${dbLot.number} não teve polígono correspondente.`);
    }
  }

  console.log(`\n===============================================================`);
  console.log(`🎉 VINCULAÇÃO CONCLUÍDA COM SUCESSO!`);
  console.log(`===============================================================`);
  console.log(`Total de Lotes Vinculados à Malha Oficial: ${linkedCount} de ${project.lots.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
