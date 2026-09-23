import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma/client';
import * as mapService from '../services/map.service';

// 1x1 transparent GIF buffer for out-of-bounds tiles
const TRANSPARENT_TILE = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function getProjectsWithMap(req: Request, res: Response, next: NextFunction) {
  try {
    const projects = await prisma.project.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        neighborhood: true,
        city: true,
        state: true,
        status: true,
        _count: {
          select: { lots: true, blocks: true, contracts: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    const enriched = await Promise.all(
      projects.map(async (p) => {
        try {
          const mapData = await mapService.getProjectMapData(p.id);
          return {
            ...p,
            hasMap: mapData.hasMap,
            hasAerialImage: mapData.hasAerialImage,
            lotsCount: p._count.lots,
            linkedLotsCount: mapData.linkedLotsCount || 0
          };
        } catch {
          return {
            ...p,
            hasMap: false,
            hasAerialImage: false,
            lotsCount: p._count.lots,
            linkedLotsCount: 0
          };
        }
      })
    );

    return res.json({ success: true, data: enriched });
  } catch (error) {
    return next(error);
  }
}

export async function getProjectMap(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    const data = await mapService.getProjectMapData(projectId);
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.message === 'Projeto não encontrado') {
      return res.status(404).json({ success: false, message: error.message });
    }
    return next(error);
  }
}

export async function getMapTile(req: Request, res: Response) {
  const { projectSlug, z, x, y } = req.params;

  // Clean the .jpg extension if present in param
  const cleanY = y.replace(/\.[^.]+$/, '');

  const tilePath = mapService.getTileFilePath(projectSlug, z, x, cleanY);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

  if (tilePath) {
    try {
      const stats = fs.statSync(tilePath);
      // Tiles menores que 2700 bytes são artefatos de borda de nodata gerados pelo gdal2tiles
      // Retornar imagem 1x1 transparente evita caixas brancas/cinzas sólidas e pedaços soltos de imagem
      if (stats.size < 2700) {
        res.setHeader('Content-Type', 'image/gif');
        return res.send(TRANSPARENT_TILE);
      }
    } catch {
      // Em caso de falha de leitura de stat, prossegue normalmente
    }

    res.setHeader('Content-Type', 'image/jpeg');
    return res.sendFile(tilePath);
  } else {
    // Return transparent 1x1 image for missing / out-of-bounds tiles
    res.setHeader('Content-Type', 'image/gif');
    return res.send(TRANSPARENT_TILE);
  }
}

export async function linkLot(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    const { lotId, featureId } = req.body;

    if (!lotId || !featureId) {
      return res.status(400).json({
        success: false,
        message: 'Lote e identificador geométrico são obrigatórios.'
      });
    }

    const updated = await mapService.linkLotToGeometry(projectId, lotId, featureId);
    return res.json({
      success: true,
      data: updated,
      message: 'Lote vinculado à geometria com sucesso.'
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

export async function unlinkLot(req: Request, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    const { featureId } = req.body;

    if (!featureId) {
      return res.status(400).json({
        success: false,
        message: 'Identificador geométrico é obrigatório.'
      });
    }

    await mapService.unlinkLotGeometry(projectId, featureId);
    return res.json({
      success: true,
      message: 'Vínculo geométrico removido com sucesso.'
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
}

