import { SuppressionsController } from './suppressions.controller';

describe('SuppressionsController', () => {
  let prisma: {
    scoped: {
      emailUnsubscribe: { findMany: jest.Mock };
      emailBounce: { findMany: jest.Mock };
    };
  };
  let controller: SuppressionsController;

  beforeEach(() => {
    prisma = {
      scoped: {
        emailUnsubscribe: { findMany: jest.fn().mockResolvedValue([]) },
        emailBounce: { findMany: jest.fn().mockResolvedValue([]) },
      },
    };
    controller = new SuppressionsController(prisma as never);
  });

  it('default take 50, sin cursor', async () => {
    await controller.findAll();
    const args = prisma.scoped.emailUnsubscribe.findMany.mock.calls[0]![0];
    expect(args.take).toBe(50);
    expect(args.cursor).toBeUndefined();
  });

  it('take se clampea a 200', async () => {
    await controller.findAll(undefined, '500');
    expect(prisma.scoped.emailUnsubscribe.findMany.mock.calls[0]![0].take).toBe(200);
  });

  it('cursor agrega skip:1 para no incluir el ítem del cursor', async () => {
    await controller.findAll('u-9');
    const args = prisma.scoped.emailUnsubscribe.findMany.mock.calls[0]![0];
    expect(args.cursor).toEqual({ id: 'u-9' });
    expect(args.skip).toBe(1);
  });

  it('devuelve {unsubscribes, bounces}', async () => {
    prisma.scoped.emailUnsubscribe.findMany.mockResolvedValueOnce([{ id: 'u1' }]);
    prisma.scoped.emailBounce.findMany.mockResolvedValueOnce([{ id: 'b1' }]);
    const r = await controller.findAll();
    expect(r).toEqual({ unsubscribes: [{ id: 'u1' }], bounces: [{ id: 'b1' }] });
  });
});
