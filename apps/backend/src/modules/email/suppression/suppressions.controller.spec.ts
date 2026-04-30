import { NotFoundException } from '@nestjs/common';
import { SuppressionsController } from './suppressions.controller';

describe('SuppressionsController', () => {
  let prisma: {
    scoped: {
      emailUnsubscribe: { findMany: jest.Mock };
      emailBounce: { findMany: jest.Mock };
    };
  };
  let suppression: {
    addUnsubscribe: jest.Mock;
    deleteUnsubscribe: jest.Mock;
    deleteBounce: jest.Mock;
  };
  let controller: SuppressionsController;

  beforeEach(() => {
    prisma = {
      scoped: {
        emailUnsubscribe: { findMany: jest.fn().mockResolvedValue([]) },
        emailBounce: { findMany: jest.fn().mockResolvedValue([]) },
      },
    };
    suppression = {
      addUnsubscribe: jest.fn().mockResolvedValue(undefined),
      deleteUnsubscribe: jest.fn().mockResolvedValue(true),
      deleteBounce: jest.fn().mockResolvedValue(true),
    };
    controller = new SuppressionsController(prisma as never, suppression as never);
  });

  describe('listUnsubscribes', () => {
    it('default limit 50, take=limit+1, sin cursor', async () => {
      await controller.listUnsubscribes();
      const args = prisma.scoped.emailUnsubscribe.findMany.mock.calls[0]![0];
      expect(args.take).toBe(51);
      expect(args.cursor).toBeUndefined();
    });

    it('limit clampea a 200', async () => {
      await controller.listUnsubscribes(undefined, '500');
      expect(prisma.scoped.emailUnsubscribe.findMany.mock.calls[0]![0].take).toBe(201);
    });

    it('cursor agrega skip:1', async () => {
      await controller.listUnsubscribes('u-9');
      const args = prisma.scoped.emailUnsubscribe.findMany.mock.calls[0]![0];
      expect(args.cursor).toEqual({ id: 'u-9' });
      expect(args.skip).toBe(1);
    });

    it('filtro email aplica where contains insensitive', async () => {
      await controller.listUnsubscribes(undefined, undefined, 'foo@bar.com');
      const args = prisma.scoped.emailUnsubscribe.findMany.mock.calls[0]![0];
      expect(args.where).toEqual({ email: { contains: 'foo@bar.com', mode: 'insensitive' } });
    });

    it('paginación: si vienen limit+1 → nextCursor', async () => {
      const rows = Array.from({ length: 51 }, (_, i) => ({ id: `u-${i}` }));
      prisma.scoped.emailUnsubscribe.findMany.mockResolvedValueOnce(rows);
      const r = await controller.listUnsubscribes();
      expect(r.items).toHaveLength(50);
      expect(r.nextCursor).toBe('u-49');
    });

    it('paginación: si vienen menos → nextCursor null', async () => {
      prisma.scoped.emailUnsubscribe.findMany.mockResolvedValueOnce([{ id: 'u-1' }]);
      const r = await controller.listUnsubscribes();
      expect(r.items).toHaveLength(1);
      expect(r.nextCursor).toBeNull();
    });
  });

  describe('listBounces', () => {
    it('orderBy occurredAt desc', async () => {
      await controller.listBounces();
      expect(prisma.scoped.emailBounce.findMany.mock.calls[0]![0].orderBy).toEqual({
        occurredAt: 'desc',
      });
    });
  });

  describe('createUnsubscribe', () => {
    it('delega a SuppressionService con source=manual', async () => {
      const r = await controller.createUnsubscribe({
        email: 'a@b.com',
        scope: 'GLOBAL',
        reason: 'pidió por slack',
      });
      expect(r).toEqual({ ok: true });
      expect(suppression.addUnsubscribe).toHaveBeenCalledWith({
        email: 'a@b.com',
        scope: 'GLOBAL',
        campaignId: null,
        reason: 'pidió por slack',
        source: 'manual',
      });
    });

    it('scope CAMPAIGN pasa campaignId', async () => {
      await controller.createUnsubscribe({ email: 'a@b.com', scope: 'CAMPAIGN', campaignId: 'c-1' });
      expect(suppression.addUnsubscribe).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'CAMPAIGN', campaignId: 'c-1' }),
      );
    });
  });

  describe('deleteUnsubscribe', () => {
    it('OK cuando borra', async () => {
      await expect(controller.deleteUnsubscribe('u-1')).resolves.toBeUndefined();
      expect(suppression.deleteUnsubscribe).toHaveBeenCalledWith('u-1');
    });

    it('404 cuando no existe (cross-tenant o id inválido)', async () => {
      suppression.deleteUnsubscribe.mockResolvedValueOnce(false);
      await expect(controller.deleteUnsubscribe('u-x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteBounce', () => {
    it('OK cuando borra', async () => {
      await expect(controller.deleteBounce('b-1')).resolves.toBeUndefined();
    });

    it('404 cuando no existe', async () => {
      suppression.deleteBounce.mockResolvedValueOnce(false);
      await expect(controller.deleteBounce('b-x')).rejects.toThrow(NotFoundException);
    });
  });
});
