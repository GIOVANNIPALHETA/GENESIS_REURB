import { Request, Response } from 'express';
import { prisma } from '../prisma/client';

export async function getDashboard(req: Request, res: Response) {
  const projectsCount = await prisma.project.count({ where: { active: true } });
  const lotsCount = await prisma.lot.count();
  const peopleCount = await prisma.person.count();
  const signedContracts = await prisma.contract.count({ where: { signed: true } });
  const totalContractValue = await prisma.contract.aggregate({ _sum: { totalValue: true } });

  return res.json({
    success: true,
    data: {
      projectsCount,
      lotsCount,
      peopleCount,
      signedContracts,
      totalContractValue: totalContractValue._sum.totalValue || 0,
    },
    message: 'Dashboard carregado',
  });
}
