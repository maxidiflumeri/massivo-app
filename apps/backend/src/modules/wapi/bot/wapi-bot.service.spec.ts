/**
 * 4.O.3 — Tests del flujo Draft/Publish del bot. Verifica que:
 * - saveDraft NO toca la versión publicada (botTopics/botRouter activos).
 * - publish copia draft → activo, limpia draft, sella botPublishedAt.
 * - discardDraft borra el draft y deja la versión publicada intacta.
 * - hasUnpublishedChanges refleja correctamente la relación entre timestamps.
 * - publish bloquea si el draft tiene refs inconsistentes (router → topicId).
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

function makePrisma(initial: Row) {
  const state: Row = { id: 'cfg-1', ...initial };
  const wapiConfig = {
    findFirst: jest.fn(async (_args: unknown) => ({ ...state })),
    update: jest.fn(async ({ data }: { data: Row }) => {
      Object.assign(state, data);
      return { ...state };
    }),
  };
  const prisma = {
    scoped: { wapiConfig },
  } as never;
  return { prisma, state, wapiConfig };
}

function makeMedia() {
  return {} as never;
}

describe('WapiBotService — 4.O.3 Draft/Publish', () => {
  it('saveDraft escribe en botTopicsDraft sin tocar botTopics activos', async () => {
    const { prisma, state } = makePrisma({
      botEnabled: false,
      botSessionTtlMin: 30,
      botFlow: null,
      botTopics: [makeTopic('A', 'Activo')],
      botRouter: null,
      botTopicsDraft: null,
      botRouterDraft: null,
      botDraftUpdatedAt: null,
      botPublishedAt: null,
    });
    const svc = new WapiBotService(prisma, makeMedia());

    await TenantContext.run(ctx, async () => {
      const newDraft = [makeTopic('A', 'Activo'), makeTopic('B', 'Borrador')];
      const snap = await svc.saveDraft('cfg-1', { botTopics: newDraft });

      expect(state.botTopics).toEqual([makeTopic('A', 'Activo')]);
      expect(state.botTopicsDraft).toEqual(newDraft);
      expect(state.botDraftUpdatedAt).toBeInstanceOf(Date);
      expect(snap.hasUnpublishedChanges).toBe(true);
    });
  });

  it('publish copia botTopicsDraft → botTopics, limpia draft y setea botPublishedAt', async () => {
    const draftTopics = [makeTopic('A', 'A'), makeTopic('B', 'B')];
    const { prisma, state } = makePrisma({
      botEnabled: false,
      botSessionTtlMin: 30,
      botFlow: null,
      botTopics: [makeTopic('A', 'A')],
      botRouter: null,
      botTopicsDraft: draftTopics,
      botRouterDraft: { rules: [], defaultTopicId: 'A' },
      botDraftUpdatedAt: new Date('2026-05-01T10:00:00Z'),
      botPublishedAt: null,
    });
    const svc = new WapiBotService(prisma, makeMedia());

    await TenantContext.run(ctx, async () => {
      const snap = await svc.publish('cfg-1');
      expect(state.botTopics).toEqual(draftTopics);
      expect(state.botRouter).toEqual({ rules: [], defaultTopicId: 'A' });
      expect(state.botTopicsDraft).toBeNull();
      expect(state.botRouterDraft).toBeNull();
      expect(state.botDraftUpdatedAt).toBeNull();
      expect(state.botPublishedAt).toBeInstanceOf(Date);
      expect(snap.hasUnpublishedChanges).toBe(false);
    });
  });

  it('discardDraft borra botTopicsDraft sin tocar la versión publicada', async () => {
    const { prisma, state } = makePrisma({
      botEnabled: false,
      botSessionTtlMin: 30,
      botFlow: null,
      botTopics: [makeTopic('A', 'A')],
      botRouter: null,
      botTopicsDraft: [makeTopic('A', 'A'), makeTopic('B', 'B')],
      botRouterDraft: null,
      botDraftUpdatedAt: new Date('2026-05-01T10:00:00Z'),
      botPublishedAt: new Date('2026-04-30T10:00:00Z'),
    });
    const svc = new WapiBotService(prisma, makeMedia());

    await TenantContext.run(ctx, async () => {
      const snap = await svc.discardDraft('cfg-1');
      expect(state.botTopics).toEqual([makeTopic('A', 'A')]);
      expect(state.botTopicsDraft).toBeNull();
      expect(state.botDraftUpdatedAt).toBeNull();
      expect(snap.hasUnpublishedChanges).toBe(false);
    });
  });

  it('hasUnpublishedChanges = false si el último publish es posterior al draftUpdatedAt', async () => {
    const { prisma } = makePrisma({
      botEnabled: false,
      botSessionTtlMin: 30,
      botFlow: null,
      botTopics: null,
      botRouter: null,
      botTopicsDraft: null,
      botRouterDraft: null,
      botDraftUpdatedAt: new Date('2026-04-01T10:00:00Z'),
      botPublishedAt: new Date('2026-05-01T10:00:00Z'),
    });
    const svc = new WapiBotService(prisma, makeMedia());

    await TenantContext.run(ctx, async () => {
      const snap = await svc.get('cfg-1');
      expect(snap.hasUnpublishedChanges).toBe(false);
    });
  });

  it('publish bloquea si el draft de router referencia un topicId que no existe en draft ni en prod', async () => {
    const { prisma } = makePrisma({
      botEnabled: false,
      botSessionTtlMin: 30,
      botFlow: null,
      botTopics: [makeTopic('A', 'A')],
      botRouter: null,
      botTopicsDraft: [makeTopic('A', 'A')],
      botRouterDraft: { rules: [{ kind: 'keyword', keywords: ['x'], topicId: 'FANTASMA' }] },
      botDraftUpdatedAt: new Date('2026-05-01T10:00:00Z'),
      botPublishedAt: null,
    });
    const svc = new WapiBotService(prisma, makeMedia());

    await TenantContext.run(ctx, async () => {
      await expect(svc.publish('cfg-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('publish falla si no hay draft (botDraftUpdatedAt null)', async () => {
    const { prisma } = makePrisma({
      botEnabled: false,
      botSessionTtlMin: 30,
      botFlow: null,
      botTopics: [makeTopic('A', 'A')],
      botRouter: null,
      botTopicsDraft: null,
      botRouterDraft: null,
      botDraftUpdatedAt: null,
      botPublishedAt: null,
    });
    const svc = new WapiBotService(prisma, makeMedia());

    await TenantContext.run(ctx, async () => {
      await expect(svc.publish('cfg-1')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
