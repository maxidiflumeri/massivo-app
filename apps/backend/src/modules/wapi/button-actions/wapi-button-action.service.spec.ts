/**
 * Tests del WapiButtonActionService (4.K). Mocks: prisma scoped + events + optOut.
 *
 * Cubre:
 *  - resolve() con context → busca template.buttonActions (string + object shape)
 *  - resolve() sin context → cae a defaults case-insensitive
 *  - resolve() con buttonId vacío → null
 *  - resolve() con button mapeado a action inválida → null
 *  - apply(INBOX) → wapiConversation.update(priority=true) + emite evento
 *  - apply(BAJA) → optOut.add(GLOBAL, source=inbound_button)
 *  - apply(IGNORAR) → no muta DB ni dispara optOut
 *  - apply() captura errores y no relanza (best-effort)
 */
import { TenantContext } from '../../../common/auth/tenant-context';
import { WapiButtonActionService } from './wapi-button-action.service';

describe('WapiButtonActionService', () => {
  let prismaScoped: {
    wapiReport: { findFirst: jest.Mock };
    wapiCampaign: { findFirst: jest.Mock };
    wapiTemplate: { findFirst: jest.Mock };
    conversation: { update: jest.Mock };
  };
  let events: { emitToTeam: jest.Mock };
  let optOut: { add: jest.Mock };
  let svc: WapiButtonActionService;

  beforeEach(() => {
    prismaScoped = {
      wapiReport: { findFirst: jest.fn() },
      wapiCampaign: { findFirst: jest.fn() },
      wapiTemplate: { findFirst: jest.fn() },
      conversation: {
        update: jest.fn().mockResolvedValue({
          id: 'conv-1',
          status: 'ASSIGNED',
          assignedUserId: 'u-1',
          unreadCount: 0,
          lastMessageAt: new Date('2026-05-01T10:00:00Z'),
          priority: true,
        }),
      },
    };
    events = { emitToTeam: jest.fn() };
    optOut = { add: jest.fn().mockResolvedValue(undefined) };
    svc = new WapiButtonActionService(
      { scoped: prismaScoped } as never,
      events as never,
      optOut as never,
    );
  });

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return TenantContext.run(
      {
        userId: 'u-1',
        organizationId: 'org-a',
        teamId: 'team-a',
        orgRole: 'OWNER',
        teamRole: 'ADMIN',
      },
      fn,
    );
  }

  describe('resolve', () => {
    it('buttonId vacío → null', async () => {
      const out = await svc.resolve({ buttonId: '   ', contextMetaMessageId: null });
      expect(out).toBeNull();
    });

    it('sin context → cae a default case-insensitive', async () => {
      const out = await svc.resolve({ buttonId: 'inbox', contextMetaMessageId: null });
      expect(out).toEqual({ action: 'INBOX', source: 'default' });
    });

    it('default no matchea → null', async () => {
      const out = await svc.resolve({ buttonId: 'qwerty', contextMetaMessageId: null });
      expect(out).toBeNull();
    });

    it('con context y template.buttonActions string shape → resuelve por template', async () => {
      prismaScoped.wapiReport.findFirst.mockResolvedValue({ campaignId: 'camp-1' });
      prismaScoped.wapiCampaign.findFirst.mockResolvedValue({ templateId: 'tpl-1' });
      prismaScoped.wapiTemplate.findFirst.mockResolvedValue({
        buttonActions: { 'Quiero hablar': 'INBOX' },
      });
      const out = await svc.resolve({
        buttonId: 'Quiero hablar',
        contextMetaMessageId: 'wamid.OUT',
      });
      expect(out).toEqual({ action: 'INBOX', source: 'template' });
    });

    it('con context y template.buttonActions object shape ({action,payload}) → resuelve action', async () => {
      prismaScoped.wapiReport.findFirst.mockResolvedValue({ campaignId: 'camp-1' });
      prismaScoped.wapiCampaign.findFirst.mockResolvedValue({ templateId: 'tpl-1' });
      prismaScoped.wapiTemplate.findFirst.mockResolvedValue({
        buttonActions: { 'No me interesa': { action: 'baja', payload: '{{factura}}' } },
      });
      const out = await svc.resolve({
        buttonId: 'No me interesa',
        contextMetaMessageId: 'wamid.OUT',
      });
      expect(out).toEqual({ action: 'BAJA', source: 'template' });
    });

    it('template existe pero buttonId no está en el map → cae a default si matchea', async () => {
      prismaScoped.wapiReport.findFirst.mockResolvedValue({ campaignId: 'camp-1' });
      prismaScoped.wapiCampaign.findFirst.mockResolvedValue({ templateId: 'tpl-1' });
      prismaScoped.wapiTemplate.findFirst.mockResolvedValue({ buttonActions: {} });
      const out = await svc.resolve({
        buttonId: 'BAJA',
        contextMetaMessageId: 'wamid.OUT',
      });
      expect(out).toEqual({ action: 'BAJA', source: 'default' });
    });

    it('template buttonAction con valor inválido → cae a default', async () => {
      prismaScoped.wapiReport.findFirst.mockResolvedValue({ campaignId: 'camp-1' });
      prismaScoped.wapiCampaign.findFirst.mockResolvedValue({ templateId: 'tpl-1' });
      prismaScoped.wapiTemplate.findFirst.mockResolvedValue({
        buttonActions: { INBOX: 'NOPE' },
      });
      const out = await svc.resolve({
        buttonId: 'INBOX',
        contextMetaMessageId: 'wamid.OUT',
      });
      expect(out).toEqual({ action: 'INBOX', source: 'default' });
    });

    it('context apunta a un report inexistente → cae a default', async () => {
      prismaScoped.wapiReport.findFirst.mockResolvedValue(null);
      const out = await svc.resolve({
        buttonId: 'IGNORAR',
        contextMetaMessageId: 'wamid.GHOST',
      });
      expect(out).toEqual({ action: 'IGNORAR', source: 'default' });
    });
  });

  describe('apply', () => {
    it('INBOX → marca priority + escalated + botSuspended y emite conversation.updated', async () => {
      await withTenant(() =>
        svc.apply({
          conversationId: 'conv-1',
          configId: 'cfg-1',
          phone: '5491100',
          action: 'INBOX',
          buttonId: 'Quiero hablar',
        }),
      );
      // 4.O.6 — INBOX equivale a un HANDOFF disparado desde el template:
      // escalada al inbox + bot suspendido hasta que el operador resuelva.
      expect(prismaScoped.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-1' },
          data: { priority: true, escalated: true, botSuspended: true },
        }),
      );
      expect(events.emitToTeam).toHaveBeenCalledWith(
        'team-a',
        'conversation.updated',
        expect.objectContaining({
          id: 'conv-1',
          channelId: 'cfg-1',
          externalUserId: '5491100',
          priority: true,
        }),
      );
      expect(optOut.add).not.toHaveBeenCalled();
    });

    it('BAJA → llama optOut.add con scope GLOBAL y source inbound_button', async () => {
      await withTenant(() =>
        svc.apply({
          conversationId: 'conv-1',
          configId: 'cfg-1',
          phone: '5491100',
          action: 'BAJA',
          buttonId: 'No me interesa',
          buttonText: 'No me interesa',
        }),
      );
      expect(optOut.add).toHaveBeenCalledWith({
        phone: '5491100',
        scope: 'GLOBAL',
        reason: expect.stringContaining('No me interesa'),
        source: 'inbound_button',
      });
      expect(prismaScoped.conversation.update).not.toHaveBeenCalled();
    });

    it('IGNORAR → no muta DB ni dispara optOut', async () => {
      await withTenant(() =>
        svc.apply({
          conversationId: 'conv-1',
          configId: 'cfg-1',
          phone: '5491100',
          action: 'IGNORAR',
          buttonId: 'Listo',
        }),
      );
      expect(prismaScoped.conversation.update).not.toHaveBeenCalled();
      expect(optOut.add).not.toHaveBeenCalled();
      expect(events.emitToTeam).not.toHaveBeenCalled();
    });

    it('si la action falla, swallow sin propagar (best-effort)', async () => {
      prismaScoped.conversation.update.mockRejectedValue(new Error('boom'));
      await expect(
        withTenant(() =>
          svc.apply({
            conversationId: 'conv-1',
            configId: 'cfg-1',
            phone: '5491100',
            action: 'INBOX',
            buttonId: 'Quiero hablar',
          }),
        ),
      ).resolves.toBeUndefined();
    });
  });
});
