/**
 * Smoke test sub-fase 3.A.
 * Crea fixtures (org+team+smtpAccount Mailpit+template+campaign+contact+report)
 * y enquola un job en BullMQ. El worker del backend (que tiene que estar corriendo
 * en otra terminal con `pnpm --filter @massivo/backend dev`) lo va a procesar.
 *
 * Verificá el resultado en:
 *   - Mailpit UI:  http://localhost:8025
 *   - DB: SELECT status, smtpMessageId FROM "EmailReport" WHERE id = '<reportId>'.
 *
 * Uso:
 *   pnpm --filter @massivo/backend exec ts-node scripts/smoke-3a.ts
 */
import * as fs from 'fs';
import * as path from 'path';

// Cargar .env (sin dep externa) — orden: .env.local sobre .env
for (const f of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '../../..', f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/i);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key] !== undefined) continue;
    process.env[key] = m[2]!.replace(/^["'](.*)["']$/, '$1');
  }
}

import { PrismaClient } from '@massivo/prisma';
import { Queue } from 'bullmq';

const prisma = new PrismaClient();

async function main() {
  const planId = await ensurePlan();
  const orgId = `smoke-org-3a`;
  const teamId = `smoke-team-3a`;

  await prisma.organization.upsert({
    where: { id: orgId },
    create: {
      id: orgId,
      clerkOrgId: `clerk-${orgId}`,
      name: 'Smoke Org',
      slug: 'smoke-org-3a',
      webhookSlug: 'wbh_smoke3a000000000000000',
      planId,
    },
    update: {},
  });
  await prisma.team.upsert({
    where: { id: teamId },
    create: { id: teamId, organizationId: orgId, name: 'Smoke Team', slug: 'smoke', isDefault: true },
    update: {},
  });

  const account = await prisma.smtpAccount.upsert({
    where: { id: 'smoke-acc-3a' },
    create: {
      id: 'smoke-acc-3a',
      organizationId: orgId,
      teamId,
      name: 'Mailpit local',
      host: '127.0.0.1',
      port: 1025,
      username: '',
      passwordEnc: '',
      fromName: 'Massivo Smoke',
      fromEmail: 'no-reply@massivo.local',
      provider: 'smtp',
    },
    update: {},
  });

  const template = await prisma.emailTemplate.upsert({
    where: { id: 'smoke-tpl-3a' },
    create: {
      id: 'smoke-tpl-3a',
      organizationId: orgId,
      teamId,
      name: 'Smoke Template',
      subject: 'Hola {{firstName}} desde 3.A',
      html: '<h1>Hola {{firstName}}</h1><p>Este email viaja por BullMQ → Worker → Mailpit.</p>',
      design: {},
      smtpAccountId: account.id,
    },
    update: {},
  });

  const campaign = await prisma.emailCampaign.upsert({
    where: { id: 'smoke-camp-3a' },
    create: {
      id: 'smoke-camp-3a',
      organizationId: orgId,
      teamId,
      name: 'Smoke Campaign',
      templateId: template.id,
      smtpAccountId: account.id,
      status: 'PROCESSING',
    },
    update: {},
  });

  const contact = await prisma.emailContact.create({
    data: {
      organizationId: orgId,
      teamId,
      campaignId: campaign.id,
      email: 'destinatario@example.com',
      data: { firstName: 'Ana' },
    },
  });

  const report = await prisma.emailReport.create({
    data: {
      organizationId: orgId,
      teamId,
      campaignId: campaign.id,
      contactId: contact.id,
      status: 'PENDING',
    },
  });

  const queue = new Queue('email-send', {
    connection: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
    },
  });
  await queue.add(
    'send',
    { reportId: report.id, organizationId: orgId, teamId },
    { jobId: report.id },
  );
  await queue.close();

  console.log('OK enquolado.');
  console.log(`  reportId = ${report.id}`);
  console.log(`  → abrí http://localhost:8025 para ver el email`);
  console.log(`  → SELECT status, "smtpMessageId" FROM "EmailReport" WHERE id = '${report.id}';`);
}

async function ensurePlan(): Promise<string> {
  const existing = await prisma.plan.findFirst({ where: { code: 'FREE' } });
  if (existing) return existing.id;
  const created = await prisma.plan.create({
    data: { code: 'FREE', name: 'Free', priceMonthlyUsd: 0, features: {}, limits: {} },
  });
  return created.id;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
