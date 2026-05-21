import { randomBytes } from 'node:crypto';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function generateWebhookSlug(): string {
  return `wbh_${randomBytes(18).toString('base64url')}`;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env var ${name} (definila en .env)`);
  }
  return v;
}

async function main() {
  const clerkUserId = requireEnv('DEV_CLERK_USER_ID');
  const clerkOrgId = requireEnv('DEV_CLERK_ORG_ID');
  const email = requireEnv('DEV_USER_EMAIL');
  const userName = process.env.DEV_USER_NAME ?? null;
  const orgName = process.env.DEV_ORG_NAME ?? 'Dev Org';
  const orgSlug = process.env.DEV_ORG_SLUG ?? 'dev-org';

  console.log('Dev seed → mapping Clerk session to local tenant');
  console.log(`  user: ${clerkUserId} (${email})`);
  console.log(`  org : ${clerkOrgId} (${orgName})`);

  const freePlan = await prisma.plan.findUnique({ where: { code: 'FREE' } });
  if (!freePlan) {
    throw new Error('Plan FREE no existe — corré primero `pnpm --filter @massivo/prisma exec prisma db seed`');
  }

  const user = await prisma.user.upsert({
    where: { clerkUserId },
    update: { email, name: userName },
    create: { clerkUserId, email, name: userName },
  });

  const org = await prisma.organization.upsert({
    where: { clerkOrgId },
    update: { name: orgName, slug: orgSlug, botEnabled: true },
    create: {
      clerkOrgId,
      name: orgName,
      slug: orgSlug,
      webhookSlug: generateWebhookSlug(),
      planId: freePlan.id,
      botEnabled: true,
    },
  });

  await prisma.orgMembership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: { role: 'OWNER' },
    create: { userId: user.id, organizationId: org.id, role: 'OWNER' },
  });

  let team = await prisma.team.findFirst({
    where: { organizationId: org.id, isDefault: true },
  });
  if (!team) {
    team = await prisma.team.create({
      data: {
        organizationId: org.id,
        name: 'General',
        slug: 'general',
        isDefault: true,
      },
    });
  }

  await prisma.teamMembership.upsert({
    where: { userId_teamId: { userId: user.id, teamId: team.id } },
    update: { role: 'ADMIN' },
    create: { userId: user.id, teamId: team.id, role: 'ADMIN' },
  });

  console.log('\nDev seed OK');
  console.log(`  user.id         = ${user.id}`);
  console.log(`  organization.id = ${org.id}`);
  console.log(`  team.id         = ${team.id}      ← X-Team-Id`);
  console.log('\nEn el navegador, DevTools → Application → Local Storage → http://localhost:5173:');
  console.log(`  key:   massivo:activeTeamId`);
  console.log(`  value: ${team.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
