/**
 * 4.O.3 — Tests del flujo Draft/Publish del bot. Verifica que:
 * - saveDraft NO toca la versión publicada (topics/router activos).
 * - publish copia draft → activo, limpia draft, sella publishedAt.
 * - discardDraft borra el draft y deja la versión publicada intacta.
 * - hasUnpublishedChanges refleja correctamente la relación entre timestamps.
 * - publish bloquea si el draft tiene refs inconsistentes (router → topicId).
 *
 * Phase 0a (multi-canal): la definición del bot vive en la entidad `Bot`
 * (resuelta vía `WapiConfig.botId`). El mock provee `prisma.scoped.channel`
 * (devuelve el `botId`) y `prisma.scoped.bot` (estado mutable del bot).
 */
import { BadRequestException } from '@nestjs/common';
import { WapiBotService } from './wapi-bot.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';
import type { BotTopic } from './wapi-bot.types';

const ctx: RequestContext = {
  organizationId: 'org-1',
  teamId: 'team-1',
  userId: 'user-1',
} as unknown as RequestContext;

function makeTopic(id: string, label: string): BotTopic {
  return {
    id,
    label,
    flow: {
      startNodeId: 'root',
      nodes: {
        root: { kind: 'HANDOFF', text: `tema ${label}`, escalate: true },
      },
    },
  };
}

type Row = Record<string, unknown>;

/**
 * Mock de Prisma. `botInitial` usa los nombres de columna de `Bot`
 * (enabled/topics/router/variables/*Draft/...). El config siempre tiene
 * `botId='bot-1'` → `resolveBot` encuentra el bot sin crearlo.
 */
function makePrisma(botInitial: Row) {
  const bot: Row = {
    id: 'bot-1',
    enabled: false,
    sessionTtlMin: 30,
    flow: null,
    topics: null,
    router: null,
    variables: null,
    topicsDraft: null,
    routerDraft: null,
    variablesDraft: null,
    draftUpdatedAt: null,
    publishedAt: null,
    ...botInitial,
  };
  const config: Row = {
    id: 'cfg-1',
    botId: 'bot-1',
    name: 'Cfg',
    phoneNumberId: 'PN-1',
    organizationId: 'org-1',
    teamId: 'team-1',
  };
  const wapiConfig = {
    findFirst: jest.fn(async (_args: unknown) => ({ ...config })),
    update: jest.fn(async ({ data }: { data: Row }) => {
      Object.assign(config, data);
      return { ...config };
    }),
  };
  const botModel = {
    findFirst: jest.fn(async (_args: unknown) => ({ ...bot })),
    update: jest.fn(async ({ data }: { data: Row }) => {
      Object.assign(bot, data);
      return { ...bot };
    }),
    create: jest.fn(async ({ data }: { data: Row }) => {
      Object.assign(bot, data);
      return { ...bot };
    }),
  };
  const prisma = {
    scoped: { channel: wapiConfig, bot: botModel },
  } as never;
  return { prisma, bot, config, wapiConfig, botModel };
}

function makeMedia() {
  return {} as never;
}

describe('WapiBotService — 4.O.3 Draft/Publish', () => {
  it('saveDraft escribe en topicsDraft sin tocar topics activos', async () => {
    const { prisma, bot } = makePrisma({
      topics: [makeTopic('A', 'Activo')],
    });
    const svc = new WapiBotService(prisma, makeMedia());

    await TenantContext.run(ctx, async () => {
      const newDraft = [makeTopic('A', 'Activo'), makeTopic('B', 'Borrador')];
      const snap = await svc.saveDraft('cfg-1', { botTopics: newDraft });

      expect(bot.topics).toEqual([makeTopic('A', 'Activo')]);
      expect(bot.topicsDraft).toEqual(newDraft);
      expect(bot.draftUpdatedAt).toBeInstanceOf(Date);
      expect(snap.hasUnpublishedChanges).toBe(true);
    });
  });

  it('publish copia topicsDraft → topics, limpia draft y setea publishedAt', async () => {
    const draftTopics = [makeTopic('A', 'A'), makeTopic('B', 'B')];
    const { prisma, bot } = makePrisma({
      topics: [makeTopic('A', 'A')],
      topicsDraft: draftTopics,
      routerDraft: { rules: [], defaultTopicId: 'A' },
      draftUpdatedAt: new Date('2026-05-01T10:00:00Z'),
    });
    const svc = new WapiBotService(prisma, makeMedia());

    await TenantContext.run(ctx, async () => {
      const snap = await svc.publish('cfg-1');
      expect(bot.topics).toEqual(draftTopics);
      expect(bot.router).toEqual({ rules: [], defaultTopicId: 'A' });
      expect(bot.topicsDraft).toBeNull();
      expect(bot.routerDraft).toBeNull();
      expect(bot.draftUpdatedAt).toBeNull();
      expect(bot.publishedAt).toBeInstanceOf(Date);
      expect(snap.hasUnpublishedChanges).toBe(false);
    });
  });

  it('discardDraft borra topicsDraft sin tocar la versión publicada', async () => {
    const { prisma, bot } = makePrisma({
      topics: [makeTopic('A', 'A')],
      topicsDraft: [makeTopic('A', 'A'), makeTopic('B', 'B')],
      draftUpdatedAt: new Date('2026-05-01T10:00:00Z'),
      publishedAt: new Date('2026-04-30T10:00:00Z'),
    });
    const svc = new WapiBotService(prisma, makeMedia());

    await TenantContext.run(ctx, async () => {
      const snap = await svc.discardDraft('cfg-1');
      expect(bot.topics).toEqual([makeTopic('A', 'A')]);
      expect(bot.topicsDraft).toBeNull();
      expect(bot.draftUpdatedAt).toBeNull();
      expect(snap.hasUnpublishedChanges).toBe(false);
    });
  });

  it('hasUnpublishedChanges = false si el último publish es posterior al draftUpdatedAt', async () => {
    const { prisma } = makePrisma({
      draftUpdatedAt: new Date('2026-04-01T10:00:00Z'),
      publishedAt: new Date('2026-05-01T10:00:00Z'),
    });
    const svc = new WapiBotService(prisma, makeMedia());

    await TenantContext.run(ctx, async () => {
      const snap = await svc.get('cfg-1');
      expect(snap.hasUnpublishedChanges).toBe(false);
    });
  });

  it('publish bloquea si el draft de router referencia un topicId que no existe en draft ni en prod', async () => {
    const { prisma } = makePrisma({
      topics: [makeTopic('A', 'A')],
      topicsDraft: [makeTopic('A', 'A')],
      routerDraft: { rules: [{ kind: 'keyword', keywords: ['x'], topicId: 'FANTASMA' }] },
      draftUpdatedAt: new Date('2026-05-01T10:00:00Z'),
    });
    const svc = new WapiBotService(prisma, makeMedia());

    await TenantContext.run(ctx, async () => {
      await expect(svc.publish('cfg-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('publish falla si no hay draft (draftUpdatedAt null)', async () => {
    const { prisma } = makePrisma({
      topics: [makeTopic('A', 'A')],
      draftUpdatedAt: null,
    });
    const svc = new WapiBotService(prisma, makeMedia());

    await TenantContext.run(ctx, async () => {
      await expect(svc.publish('cfg-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
