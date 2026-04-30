import type { Request, Response } from 'express';
import { UnsubscribeController } from './unsubscribe.controller';

describe('UnsubscribeController', () => {
  let tokens: { verify: jest.Mock };
  let suppression: { addUnsubscribe: jest.Mock };
  let prisma: { scoped: { emailReport: { findFirst: jest.Mock } } };
  let controller: UnsubscribeController;

  beforeEach(() => {
    tokens = { verify: jest.fn() };
    suppression = { addUnsubscribe: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      scoped: {
        emailReport: {
          findFirst: jest.fn().mockResolvedValue({ contact: { email: 'a@b.com' } }),
        },
      },
    };
    controller = new UnsubscribeController(tokens as never, suppression as never, prisma as never);
  });

  function mockRes(): Response {
    const res: Record<string, jest.Mock> = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };
    return res as never;
  }
  function mockReq(headers: Record<string, string> = {}): Request {
    return { headers } as never;
  }

  it('token válido + scope default GLOBAL → addUnsubscribe + 200 OK', async () => {
    tokens.verify.mockReturnValueOnce({ r: 'r1', o: 'o', t: 't', c: 'c1' });
    const res = mockRes();
    await controller.unsubscribe('tok', undefined, mockReq({ 'user-agent': 'UA' }), res);

    expect(suppression.addUnsubscribe).toHaveBeenCalledWith(expect.objectContaining({
      email: 'a@b.com', scope: 'GLOBAL', campaignId: null, source: 'link', reason: 'UA',
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('Desuscripción confirmada'));
  });

  it('scope=campaign → addUnsubscribe CAMPAIGN con campaignId del JWT', async () => {
    tokens.verify.mockReturnValueOnce({ r: 'r1', o: 'o', t: 't', c: 'camp-9' });
    const res = mockRes();
    await controller.unsubscribe('tok', 'campaign', mockReq(), res);

    expect(suppression.addUnsubscribe).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'CAMPAIGN', campaignId: 'camp-9',
    }));
  });

  it('token inválido NO leakea: 200 igual, sin addUnsubscribe', async () => {
    tokens.verify.mockImplementationOnce(() => { throw new Error('bad'); });
    const res = mockRes();
    await controller.unsubscribe('bad', undefined, mockReq(), res);

    expect(suppression.addUnsubscribe).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('report no encontrado en tenant → 200 igual sin addUnsubscribe', async () => {
    tokens.verify.mockReturnValueOnce({ r: 'r-x', o: 'o', t: 't', c: 'c' });
    prisma.scoped.emailReport.findFirst.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.unsubscribe('tok', undefined, mockReq(), res);

    expect(suppression.addUnsubscribe).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
