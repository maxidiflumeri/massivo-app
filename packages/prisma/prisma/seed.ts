import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding plans...');

  const plans = [
    {
      code: 'FREE',
      name: 'Free',
      priceMonthlyUsd: 0,
      features: { multiTeam: false, ai: false },
      limits: { emailsPerMonth: 1000, wapiMessagesPerMonth: 250, teams: 1, members: 2 },
    },
    {
      code: 'STARTER',
      name: 'Starter',
      priceMonthlyUsd: 29,
      features: { multiTeam: false, ai: true },
      limits: { emailsPerMonth: 25000, wapiMessagesPerMonth: 5000, teams: 1, members: 5 },
    },
    {
      code: 'BUSINESS',
      name: 'Business',
      priceMonthlyUsd: 99,
      features: { multiTeam: true, ai: true },
      limits: { emailsPerMonth: 150000, wapiMessagesPerMonth: 30000, teams: 5, members: 20 },
    },
    {
      code: 'ENTERPRISE',
      name: 'Enterprise',
      priceMonthlyUsd: 299,
      features: { multiTeam: true, ai: true, ssoSaml: true },
      limits: { emailsPerMonth: -1, wapiMessagesPerMonth: -1, teams: -1, members: -1 }, // -1 implies custom/unlimited
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        priceMonthlyUsd: plan.priceMonthlyUsd,
        features: plan.features,
        limits: plan.limits,
      },
      create: {
        code: plan.code,
        name: plan.name,
        priceMonthlyUsd: plan.priceMonthlyUsd,
        features: plan.features,
        limits: plan.limits,
      },
    });
  }

  console.log('Plans seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
