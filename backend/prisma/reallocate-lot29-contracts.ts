import { PrismaClient, OccupancyType, LotStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface DirectReallocation {
  contractNumber: string;
  clientCpf: string;
  clientName: string;
  projectName: string;
  projectId: string;
  blockNumber: string;
  lotNumber: string;
  newContractPrefix: string;
}

const directList: DirectReallocation[] = [
  // Dardanellos
  {
    contractNumber: 'CTR-1-29-9361',
    clientCpf: '05776185122',
    clientName: 'JESSICA GABRECHT SOUSA',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '7',
    lotNumber: '36-C',
    newContractPrefix: 'CTR-DARD-7-36-C',
  },
  {
    contractNumber: 'CTR-1-29-7755',
    clientCpf: '01328001105',
    clientName: 'AMILTON JOÃO DA SILVA',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '5',
    lotNumber: '32',
    newContractPrefix: 'CTR-DARD-5-32',
  },
  {
    contractNumber: 'CTR-1-29-8823',
    clientCpf: '72973226287',
    clientName: 'FRANCISCA RAPOSA DE OLIVEIRA',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '6',
    lotNumber: '29-A',
    newContractPrefix: 'CTR-DARD-6-29-A',
  },
  {
    contractNumber: 'CTR-1-29-8889',
    clientCpf: '69301166372',
    clientName: 'FRANCISCO OSIRES NASCIMENTO',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '9',
    lotNumber: '10',
    newContractPrefix: 'CTR-DARD-9-10',
  },
  {
    contractNumber: 'CTR-1-29-9635',
    clientCpf: '26475278220',
    clientName: 'JOSINO DE ARAUJO NOGUEIRA',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '6',
    lotNumber: '23',
    newContractPrefix: 'CTR-DARD-6-23',
  },
  {
    contractNumber: 'CTR-1-29-9847',
    clientCpf: '62776355734',
    clientName: 'LUCIA MARIA LOHMANN',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '8',
    lotNumber: '8',
    newContractPrefix: 'CTR-DARD-8-08',
  },
  {
    contractNumber: 'CTR-1-29-0037',
    clientCpf: '24846759253',
    clientName: 'MARIA APARECIDA NUNES',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '5',
    lotNumber: '13-A',
    newContractPrefix: 'CTR-DARD-5-13-A',
  },
  {
    contractNumber: 'CTR-1-29-0104',
    clientCpf: '72341513204',
    clientName: 'MARIA DA SILVA LIMA',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '8',
    lotNumber: '4',
    newContractPrefix: 'CTR-DARD-8-04',
  },
  {
    contractNumber: 'CTR-1-29-0173',
    clientCpf: '86134833304',
    clientName: 'MARIA DE SOUSA SILVA',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '4',
    lotNumber: '19',
    newContractPrefix: 'CTR-DARD-4-19',
  },
  {
    contractNumber: 'CTR-1-29-0392',
    clientCpf: '14668275808',
    clientName: 'MIRIAM LIMA DOS SANTOS NOGUEIRA',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '6',
    lotNumber: '25',
    newContractPrefix: 'CTR-DARD-6-25',
  },
  {
    contractNumber: 'CTR-1-29-0445',
    clientCpf: '00251803201',
    clientName: 'NEUMA MARIA DE SOUZA',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '9',
    lotNumber: '14',
    newContractPrefix: 'CTR-DARD-9-14',
  },
  {
    contractNumber: 'CTR-1-29-0608',
    clientCpf: '53795113172',
    clientName: 'PAULO ALEXANDRINO DE SOUZA',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '4',
    lotNumber: '11',
    newContractPrefix: 'CTR-DARD-4-11',
  },
  {
    contractNumber: 'CTR-1-29-0765',
    clientCpf: '02815701162',
    clientName: 'SERGIO RIBEIRO DOS SANTOS',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '6',
    lotNumber: '22',
    newContractPrefix: 'CTR-DARD-6-22',
  },
  {
    contractNumber: 'CTR-1-29-0887',
    clientCpf: '46083979153',
    clientName: 'SONIA HELENA RAMOS',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '7',
    lotNumber: '37-B',
    newContractPrefix: 'CTR-DARD-7-37-B',
  },
  {
    contractNumber: 'CTR-1-29-0954',
    clientCpf: '88039188172',
    clientName: 'TIAGO DOS SANTOS OLIVEIRA',
    projectName: 'TECO - FREI CANUTO - DARDANELLOS',
    projectId: 'project-teco-frei-canuto-dardanellos',
    blockNumber: '7',
    lotNumber: '07-A',
    newContractPrefix: 'CTR-DARD-7-07-A',
  },

  // Tatão
  {
    contractNumber: 'CTR-1-29-8317',
    clientCpf: '73731838249',
    clientName: 'DARIO BARBOSA DA SILVA',
    projectName: 'Tatão - Aripuanã',
    projectId: 'project-tatao-aripuana',
    blockNumber: '2',
    lotNumber: '16',
    newContractPrefix: 'CTR-TATAO-2-16',
  },
  {
    contractNumber: 'CTR-1-29-8607',
    clientCpf: '03097306196',
    clientName: 'ERDILENE MARIA BORGES',
    projectName: 'Tatão - Aripuanã',
    projectId: 'project-tatao-aripuana',
    blockNumber: '7',
    lotNumber: '20',
    newContractPrefix: 'CTR-TATAO-7-20',
  },
  {
    contractNumber: 'CTR-1-29-0003',
    clientCpf: '02693383226',
    clientName: 'MARIA APARECIDA MOREIRA COSTA',
    projectName: 'Tatão - Aripuanã',
    projectId: 'project-tatao-aripuana',
    blockNumber: '9',
    lotNumber: '20',
    newContractPrefix: 'CTR-TATAO-9-20',
  },
];

async function main() {
  console.log('🚀 Iniciando realocação de contratos indevidos do Lote 29 (Vila Nova Aripuanã)...');

  // =========================================================================
  // 1. REALLOCATE DIRECT CONTRACTS (Dardanellos & Tatão)
  // =========================================================================
  console.log('\n--- ETAPA 1: Realocando contratos de Dardanellos e Tatão ---');
  for (const item of directList) {
    const contract = await prisma.contract.findUnique({
      where: { contractNumber: item.contractNumber },
      include: { person: true, lot: true },
    });

    if (!contract) {
      console.warn(`⚠️ Contrato ${item.contractNumber} (${item.clientName}) não encontrado no banco.`);
      continue;
    }

    // A. Encontrar ou criar Quadra
    let block = await prisma.block.findFirst({
      where: {
        projectId: item.projectId,
        number: item.blockNumber,
      },
    });

    if (!block) {
      block = await prisma.block.create({
        data: {
          projectId: item.projectId,
          number: item.blockNumber,
          description: `Quadra ${item.blockNumber} - ${item.projectName}`,
        },
      });
      console.log(`   🧱 Quadra ${item.blockNumber} criada no projeto ${item.projectName}.`);
    }

    // B. Encontrar ou criar Lote
    let lot = await prisma.lot.findFirst({
      where: {
        projectId: item.projectId,
        blockId: block.id,
        number: { in: [item.lotNumber, item.lotNumber.replace(/^0+/, ''), `0${item.lotNumber}`] },
      },
    });

    if (!lot) {
      lot = await prisma.lot.create({
        data: {
          projectId: item.projectId,
          blockId: block.id,
          number: item.lotNumber,
          status: LotStatus.CONTRACT_SIGNED,
        },
      });
      console.log(`   🏡 Lote ${item.lotNumber} criado na Quadra ${item.blockNumber} (${item.projectName}).`);
    } else {
      await prisma.lot.update({
        where: { id: lot.id },
        data: { status: LotStatus.CONTRACT_SIGNED },
      });
    }

    // C. Encontrar ou criar Ocupação para a Pessoa no Lote correto
    const existingOcc = await prisma.occupancy.findFirst({
      where: {
        personId: contract.personId,
        lotId: lot.id,
      },
    });

    if (!existingOcc) {
      await prisma.occupancy.create({
        data: {
          personId: contract.personId,
          lotId: lot.id,
          type: OccupancyType.OWNER,
          current: true,
        },
      });
      console.log(`   👤 Ocupação de proprietário registrada para ${contract.person.fullName} no Lote ${lot.number}.`);
    }

    // D. Atualizar Contrato
    let newContractNumber = item.newContractPrefix;
    const existingWithPrefix = await prisma.contract.findUnique({
      where: { contractNumber: newContractNumber },
    });
    if (existingWithPrefix && existingWithPrefix.id !== contract.id) {
      newContractNumber = `${item.newContractPrefix}-${contract.personId.slice(0, 4)}`;
    }

    await prisma.contract.update({
      where: { id: contract.id },
      data: {
        lotId: lot.id,
        projectId: item.projectId,
        contractNumber: newContractNumber,
      },
    });

    console.log(`   ✅ Contrato ${item.contractNumber} -> ${newContractNumber} vinculado ao Lote ${lot.number} (Qd ${block.number}) no projeto ${item.projectName}.`);
  }

  // =========================================================================
  // 2. DAVI / DAVID BATISTA BOTONI (Vila Nova Aripuanã, Quadra 5, Lote 14)
  // =========================================================================
  console.log('\n--- ETAPA 2: Unificando Davi Batista Botoni (Vila Nova, Qd 5, Lt 14) ---');
  const daviTargetLot = await prisma.lot.findUnique({
    where: { id: 'lot-project-vila-nova-aripuana-5-14' },
    include: { block: true },
  });
  const daviPerson = await prisma.person.findFirst({
    where: { fullName: { contains: 'DAVI BATISTA BOTONI', mode: 'insensitive' } },
  });
  const davidPerson = await prisma.person.findFirst({
    where: { fullName: { contains: 'DAVID BATISTA BOTONI', mode: 'insensitive' } },
    include: { contracts: { include: { negotiations: { include: { installments: true } } } } },
  });

  if (daviPerson && davidPerson && daviTargetLot) {
    const targetCpf = davidPerson.cpf || '84109831172';
    // 1. Libera o CPF na pessoa duplicada para evitar conflito de unique
    await prisma.person.update({
      where: { id: davidPerson.id },
      data: { cpf: null },
    });

    // 2. Atualiza CPF na pessoa principal
    await prisma.person.update({
      where: { id: daviPerson.id },
      data: { cpf: targetCpf },
    });

    const daviContract = await prisma.contract.findFirst({
      where: { lotId: daviTargetLot.id, personId: daviPerson.id },
    });

    const davidContract = davidPerson.contracts.find((c) => c.contractNumber === 'CTR-1-29-8331');

    if (davidContract && daviContract) {
      // Move as negociações de davidContract para daviContract
      for (const neg of davidContract.negotiations) {
        await prisma.negotiation.update({
          where: { id: neg.id },
          data: { contractId: daviContract.id },
        });
      }

      await prisma.contract.update({
        where: { id: daviContract.id },
        data: {
          signed: true,
          signedAt: new Date(),
          totalValue: davidContract.totalValue,
          status: 'ACTIVE',
        },
      });

      // Remove o contrato residual e a pessoa duplicada
      await prisma.contractChain.deleteMany({ where: { contractId: davidContract.id } });
      await prisma.contract.delete({ where: { id: davidContract.id } });
      await prisma.person.delete({ where: { id: davidPerson.id } });
      console.log(`   ✅ Davi Batista Botoni unificado no Lote 14, Quadra 5 de Vila Nova Aripuanã.`);
    }
  }

  // =========================================================================
  // 3. ÁGUA BOA DUPLICATES (Celia, Cristiane, Dalva)
  // =========================================================================
  console.log('\n--- ETAPA 3: Resolvendo duplicidades de Água Boa (Celia, Cristiane, Dalva) ---');
  // Celia Pereira do Vale: mover a negociação/parcela de entrada (R$ 402) para CTR-1493-1-39
  const celiaDup = await prisma.contract.findUnique({
    where: { contractNumber: 'CTR-1-29-8129' },
    include: { negotiations: { include: { installments: { include: { payments: true } } } } },
  });
  const celiaReal = await prisma.contract.findUnique({
    where: { contractNumber: 'CTR-1493-1-39' },
  });

  if (celiaDup && celiaReal) {
    for (const neg of celiaDup.negotiations) {
      const hasPaid = neg.installments.some((i) => i.payments.length > 0);
      if (hasPaid) {
        // Mover a negociação que tem o pagamento de R$ 402 para o contrato real
        await prisma.negotiation.update({
          where: { id: neg.id },
          data: { contractId: celiaReal.id },
        });
        console.log(`   💰 Entrada de R$ 402 de Celia Pereira do Vale movida para o contrato oficial ${celiaReal.contractNumber}.`);
      } else {
        // Remover parcelas não pagas duplicadas
        for (const inst of neg.installments) {
          await prisma.installment.delete({ where: { id: inst.id } });
        }
        await prisma.negotiation.delete({ where: { id: neg.id } });
      }
    }
    await prisma.contractChain.deleteMany({ where: { contractId: celiaDup.id } });
    await prisma.contract.delete({ where: { id: celiaDup.id } });
    console.log(`   ✅ Contrato residual CTR-1-29-8129 de Celia removido do Lote 29.`);
  }

  // Cristiane Eliane de Oliveira Souza: remover contrato residual no Lote 29
  const cristianeDup = await prisma.contract.findUnique({
    where: { contractNumber: 'CTR-1-29-8233' },
    include: { negotiations: { include: { installments: { include: { payments: true } } } } },
  });
  if (cristianeDup) {
    for (const neg of cristianeDup.negotiations) {
      for (const inst of neg.installments) {
        await prisma.payment.deleteMany({ where: { installmentId: inst.id } });
        await prisma.installment.delete({ where: { id: inst.id } });
      }
      await prisma.negotiation.delete({ where: { id: neg.id } });
    }
    await prisma.contractChain.deleteMany({ where: { contractId: cristianeDup.id } });
    await prisma.contract.delete({ where: { id: cristianeDup.id } });
    console.log(`   ✅ Contrato residual CTR-1-29-8233 de Cristiane removido do Lote 29.`);
  }

  // Dalva Alexandre dos Reis: remover contrato residual no Lote 29
  const dalvaDup = await prisma.contract.findUnique({
    where: { contractNumber: 'CTR-1-29-8253' },
    include: { negotiations: { include: { installments: { include: { payments: true } } } } },
  });
  if (dalvaDup) {
    for (const neg of dalvaDup.negotiations) {
      for (const inst of neg.installments) {
        await prisma.payment.deleteMany({ where: { installmentId: inst.id } });
        await prisma.installment.delete({ where: { id: inst.id } });
      }
      await prisma.negotiation.delete({ where: { id: neg.id } });
    }
    await prisma.contractChain.deleteMany({ where: { contractId: dalvaDup.id } });
    await prisma.contract.delete({ where: { id: dalvaDup.id } });
    console.log(`   ✅ Contrato residual CTR-1-29-8253 de Dalva removido do Lote 29.`);
  }

  // =========================================================================
  // 4. CLIENTS WITH PENDING LOT IDENTIFICATION (Erasmo, Gabriel, Janete)
  // =========================================================================
  console.log('\n--- ETAPA 4: Isolando clientes pendentes de identificação de lote (Erasmo, Gabriel, Janete) ---');
  // Cria uma Quadra específica no projeto Vila Nova Aripuanã para contratos pendentes
  let pendingBlock = await prisma.block.findFirst({
    where: {
      projectId: 'project-vila-nova-aripuana',
      number: 'A DEFINIR',
    },
  });
  if (!pendingBlock) {
    pendingBlock = await prisma.block.create({
      data: {
        projectId: 'project-vila-nova-aripuana',
        number: 'A DEFINIR',
        description: 'Setor de Contratos e Lotes em Identificação Topográfica',
      },
    });
    console.log(`   🧱 Quadra 'A DEFINIR' criada em Vila Nova Aripuanã.`);
  }

  const pendingClients = [
    {
      contractNumber: 'CTR-1-29-8573',
      cpf: '03997234396',
      lotNumber: 'AD-ERASMO',
      newContractNumber: 'CTR-PEND-ERASMO',
      name: 'Erasmo da Silva Galvão',
    },
    {
      contractNumber: 'CTR-1-29-8921',
      cpf: '06127033128',
      lotNumber: 'AD-GABRIEL',
      newContractNumber: 'CTR-PEND-GABRIEL',
      name: 'Gabriel Barrozo Rossetto',
    },
    {
      contractNumber: 'CTR-1-29-9315',
      cpf: '89979818115',
      lotNumber: 'AD-JANETE',
      newContractNumber: 'CTR-PEND-JANETE',
      name: 'Janete Vicente Nascimento',
    },
  ];

  for (const pc of pendingClients) {
    const ctr = await prisma.contract.findUnique({
      where: { contractNumber: pc.contractNumber },
      include: { person: true },
    });

    if (!ctr) {
      console.warn(`⚠️ Contrato ${pc.contractNumber} de ${pc.name} não encontrado.`);
      continue;
    }

    let pLot = await prisma.lot.findFirst({
      where: {
        projectId: 'project-vila-nova-aripuana',
        blockId: pendingBlock.id,
        number: pc.lotNumber,
      },
    });

    if (!pLot) {
      pLot = await prisma.lot.create({
        data: {
          projectId: 'project-vila-nova-aripuana',
          blockId: pendingBlock.id,
          number: pc.lotNumber,
          observations: `Lote pendente de identificação cadastral para ${pc.name} (CPF: ${pc.cpf})`,
          status: LotStatus.CONTRACT_SIGNED,
        },
      });
      console.log(`   🏡 Lote ${pc.lotNumber} criado na Quadra A DEFINIR.`);
    }

    const existingOcc = await prisma.occupancy.findFirst({
      where: {
        personId: ctr.personId,
        lotId: pLot.id,
      },
    });

    if (!existingOcc) {
      await prisma.occupancy.create({
        data: {
          personId: ctr.personId,
          lotId: pLot.id,
          type: OccupancyType.OWNER,
          current: true,
        },
      });
    }

    await prisma.contract.update({
      where: { id: ctr.id },
      data: {
        lotId: pLot.id,
        projectId: 'project-vila-nova-aripuana',
        contractNumber: pc.newContractNumber,
      },
    });

    console.log(`   ✅ Contrato ${pc.contractNumber} de ${pc.name} movido para ${pc.newContractNumber} no lote ${pc.lotNumber}.`);
  }

  // =========================================================================
  // 5. VERIFICAÇÃO FINAL DO LOTE 29
  // =========================================================================
  console.log('\n--- ETAPA 5: Verificação final do Lote 29 (Vila Nova Aripuanã) ---');
  const lot29Final = await prisma.lot.findUnique({
    where: { id: 'lot-project-vila-nova-aripuana-1-29' },
    include: {
      block: true,
      project: true,
      occupancies: { include: { person: true } },
      contracts: { include: { person: true, negotiations: { include: { installments: true } } } },
    },
  });

  console.log(`Lote: ${lot29Final?.number}, Quadra: ${lot29Final?.block.number}, Projeto: ${lot29Final?.project.name}`);
  console.log(`Total de contratos no Lote 29: ${lot29Final?.contracts.length}`);
  for (const c of lot29Final?.contracts || []) {
    console.log(`  - Contrato: ${c.contractNumber} | Titular: ${c.person.fullName} | Status: ${c.status}`);
  }
  console.log(`Total de ocupações no Lote 29: ${lot29Final?.occupancies.length}`);
  for (const o of lot29Final?.occupancies || []) {
    console.log(`  - Ocupante: ${o.person.fullName} (${o.type}, Current: ${o.current})`);
  }

  console.log('\n🎉 Realocação concluída com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro na realocação:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
