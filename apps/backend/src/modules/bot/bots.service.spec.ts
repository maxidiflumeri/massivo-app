/**
 * Phase 0b — Tests del API bot-centric de BotService (operan por botId):
 * createBot, getBot, updateBot (guard de activación), listBots, deleteBot,
 * setConfigBot (conectar/desconectar canal).
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BotService } from './bot.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';
import type { BotTopic } from './bot.types';

const ctx: RequestContext = {
  organizationId: 'org-1',
  teamId: 'team-1',
  userId: 'user-1',
} as unknown as RequestContext;

type Row = Record<string, unknown>;

const BOT_DEFAULTS: Row = {
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
};

function makeTopic(id: string): BotTopic {
  return {
    id,
    label: id,
    flow: { startNodeId: 'r', nodes: { r: { kind: 'HANDOFF', text: 't', escalate: true } } },
  };
}

function makePrisma(seedBots: Row[] = []) {
  const bots = new Map<string, Row>();
  for (const b of seedBots) bots.set(b.id as string, { ...BOT_DEFAULTS, ...b });
  const configs = new Map<string, Row>([
    ['cfg-1', { id: 'cfg-1', name: 'Número 1', phoneNumberId: 'PN-1', botId: null }],
  ]);
  let createSeq = 0;

  const bot = {
    findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
      const b = bots.get(where.id);
      return b ? { ...b } : null;
    }),
    findMany: jest.fn(async () =>
      [...bots.values()].map((b) => ({
        ...b,
        updatedAt: new Date('2026-06-01T00:00:00Z'),
        channels: [...configs.values()]
          .filter((c) => c.botId === b.id)
          .map((c) => ({ id: c.id, name: c.name, phoneNumberId: c.phoneNumberId })),
      })),
    ),
    create: jest.fn(async ({ data }: { data: Row }) => {
      const id = `bot-${++createSeq}`;
      const row = { id, ...BOT_DEFAULTS, ...data };
      bots.set(id, row);
      return { ...row };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = { ...bots.get(where.id), ...data };
      bots.set(where.id, row);
      return { ...row };
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      bots.delete(where.id);
      return {};
    }),
  };

  const wapiConfig = {
    findMany: jest.fn(async ({ where }: { where: { botId: string } }) =>
      [...configs.values()]
        .filter((c) => c.botId === where.botId)
        .map((c) => ({ id: c.id, name: c.name, phoneNumberId: c.phoneNumberId })),
    ),
    findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
      const c = configs.get(where.id);
      return c ? { id: c.id, name: c.name, phoneNumberId: c.phoneNumberId } : null;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
      const c = configs.get(where.id);
      if (c) Object.assign(c, data);
      return { ...c };
    }),
  };

  const prisma = {
    scoped: { bot, channel: wapiConfig },
    // Quota check de createBot (Plan.limits.bots): plan generoso por default.
    organization: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        plan: { code: 'TEST', limits: { bots: -1 } },
      }),
    },
    bot: { count: jest.fn().mockResolvedValue(0) },
  } as never;
  return { prisma, bots, configs, botModel: bot, wapiConfig };
}

function makeMedia() {
  return {} as never;
}

describe('BotService — API bot-centric (Phase 0b)', () => {
  it('createBot crea un bot vacío y devuelve snapshot con botId/name', async () => {
    const { prisma, bots } = makePrisma();
    const svc = new BotService(prisma, makeMedia());
    await TenantContext.run(ctx, async () => {
      const snap = await svc.createBot({ name: '  Mi Bot  ' });
      expect(snap.botId).toBe('bot-1');
      expect(snap.name).toBe('Mi Bot');
      expect(snap.botEnabled).toBe(false);
      expect(snap.connectedChannels).toEqual([]);
      expect(bots.get('bot-1')).toBeDefined();
    });
  });

  it('createBot rechaza nombre vacío', async () => {
    const { prisma } = makePrisma();
    const svc = new BotService(prisma, makeMedia());
    await TenantContext.run(ctx, async () => {
      await expect(svc.createBot({ name: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('getBot devuelve snapshot + canales conectados', async () => {
    const { prisma, configs } = makePrisma([{ id: 'bot-9', name: 'Bot 9', topics: [makeTopic('A')] }]);
    (configs.get('cfg-1') as Row).botId = 'bot-9';
    const svc = new BotService(prisma, makeMedia());
    await TenantContext.run(ctx, async () => {
      const snap = await svc.getBot('bot-9');
      expect(snap.botId).toBe('bot-9');
      expect(snap.connectedChannels).toEqual([
        { configId: 'cfg-1', name: 'Número 1', phoneNumberId: 'PN-1', kind: 'WHATSAPP' },
      ]);
    });
  });

  it('getBot lanza 404 si el bot no existe en el scope', async () => {
    const { prisma } = makePrisma();
    const svc = new BotService(prisma, makeMedia());
    await TenantContext.run(ctx, async () => {
      await expect(svc.getBot('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('updateBot bloquea activar un bot sin flow ni topics', async () => {
    const { prisma } = makePrisma([{ id: 'bot-2', name: 'Vacío' }]);
    const svc = new BotService(prisma, makeMedia());
    await TenantContext.run(ctx, async () => {
      await expect(svc.updateBot('bot-2', { botEnabled: true })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('updateBot permite activar si ya hay topics', async () => {
    const { prisma } = makePrisma([{ id: 'bot-3', name: 'Con topics', topics: [makeTopic('A')] }]);
    const svc = new BotService(prisma, makeMedia());
    await TenantContext.run(ctx, async () => {
      const snap = await svc.updateBot('bot-3', { botEnabled: true });
      expect(snap.botEnabled).toBe(true);
    });
  });

  it('listBots mapea bots con sus canales conectados', async () => {
    const { prisma, configs } = makePrisma([
      { id: 'bot-a', name: 'A' },
      { id: 'bot-b', name: 'B' },
    ]);
    (configs.get('cfg-1') as Row).botId = 'bot-a';
    const svc = new BotService(prisma, makeMedia());
    await TenantContext.run(ctx, async () => {
      const list = await svc.listBots();
      expect(list.map((b) => b.botId).sort()).toEqual(['bot-a', 'bot-b']);
      const a = list.find((b) => b.botId === 'bot-a')!;
      expect(a.connectedChannels).toHaveLength(1);
    });
  });

  it('setConfigBot conecta un canal a un bot', async () => {
    const { prisma, configs } = makePrisma([{ id: 'bot-x', name: 'X' }]);
    const svc = new BotService(prisma, makeMedia());
    await TenantContext.run(ctx, async () => {
      const ch = await svc.setConfigBot('cfg-1', 'bot-x');
      expect(ch.configId).toBe('cfg-1');
      expect((configs.get('cfg-1') as Row).botId).toBe('bot-x');
    });
  });

  it('setConfigBot desconecta (botId=null)', async () => {
    const { prisma, configs } = makePrisma([{ id: 'bot-x', name: 'X' }]);
    (configs.get('cfg-1') as Row).botId = 'bot-x';
    const svc = new BotService(prisma, makeMedia());
    await TenantContext.run(ctx, async () => {
      await svc.setConfigBot('cfg-1', null);
      expect((configs.get('cfg-1') as Row).botId).toBeNull();
    });
  });

  it('deleteBot borra el bot del scope', async () => {
    const { prisma, bots } = makePrisma([{ id: 'bot-del', name: 'Del' }]);
    const svc = new BotService(prisma, makeMedia());
    await TenantContext.run(ctx, async () => {
      await svc.deleteBot('bot-del');
      expect(bots.has('bot-del')).toBe(false);
    });
  });
});
