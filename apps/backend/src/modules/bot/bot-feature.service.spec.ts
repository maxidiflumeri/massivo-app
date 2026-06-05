import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotFeatureService } from './bot-feature.service';
import { TenantContext } from '../../common/auth/tenant-context';
import type { RequestContext } from '@massivo/shared-types';

function makeConfig(envOn: boolean): ConfigService {
  return {
    get: jest.fn((key: string) =>
      key === 'WAPI_BOT_FEATURE_ENABLED' ? (envOn ? 'true' : 'false') : undefined,
    ),
  } as unknown as ConfigService;
}

function makePrisma(orgRow: { botEnabled: boolean } | null) {
  return {
    organization: {
      findUnique: jest.fn().mockResolvedValue(orgRow),
    },
  } as never;
}

const ctx: RequestContext = {
  organizationId: 'org-1',
  teamId: 'team-1',
  userId: 'user-1',
} as unknown as RequestContext;

describe('BotFeatureService', () => {
  it('isEnabled = false si env off, sin tocar DB', async () => {
    const svc = new BotFeatureService(makeConfig(false), makePrisma({ botEnabled: true }));
    await TenantContext.run(ctx, async () => {
      expect(await svc.isEnabled()).toBe(false);
    });
  });

  it('isEnabled = false si env on pero org off', async () => {
    const svc = new BotFeatureService(makeConfig(true), makePrisma({ botEnabled: false }));
    await TenantContext.run(ctx, async () => {
      expect(await svc.isEnabled()).toBe(false);
    });
  });

  it('isEnabled = true si env on AND org on', async () => {
    const svc = new BotFeatureService(makeConfig(true), makePrisma({ botEnabled: true }));
    await TenantContext.run(ctx, async () => {
      expect(await svc.isEnabled()).toBe(true);
    });
  });

  it('isEnabled = false sin contexto tenant (defensive)', async () => {
    const svc = new BotFeatureService(makeConfig(true), makePrisma({ botEnabled: true }));
    expect(await svc.isEnabled()).toBe(false);
  });

  it('assertEnabled lanza Forbidden si env off', async () => {
    const svc = new BotFeatureService(makeConfig(false), makePrisma({ botEnabled: true }));
    await TenantContext.run(ctx, async () => {
      await expect(svc.assertEnabled()).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('assertEnabled lanza Forbidden si org off', async () => {
    const svc = new BotFeatureService(makeConfig(true), makePrisma({ botEnabled: false }));
    await TenantContext.run(ctx, async () => {
      await expect(svc.assertEnabled()).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('assertEnabled pasa si ambos on', async () => {
    const svc = new BotFeatureService(makeConfig(true), makePrisma({ botEnabled: true }));
    await TenantContext.run(ctx, async () => {
      await expect(svc.assertEnabled()).resolves.toBeUndefined();
    });
  });
});
