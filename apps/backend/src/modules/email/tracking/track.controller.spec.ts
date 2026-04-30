import type { Request, Response } from 'express';
import { TrackController } from './track.controller';

describe('TrackController', () => {
  let tokens: { verify: jest.Mock };
  let track: { record: jest.Mock };
  let controller: TrackController;

  beforeEach(() => {
    tokens = { verify: jest.fn() };
    track = { record: jest.fn().mockResolvedValue(undefined) };
    controller = new TrackController(tokens as never, track as never);
  });

  function mockRes(): Response & {
    setHeader: jest.Mock;
    status: jest.Mock;
    end: jest.Mock;
    redirect: jest.Mock;
  } {
    const res: Record<string, jest.Mock> = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
      redirect: jest.fn(),
    };
    return res as never;
  }
  function mockReq(headers: Record<string, string> = {}): Request {
    return { headers, socket: { remoteAddress: '1.1.1.1' } } as never;
  }

  describe('GET /track/open.gif', () => {
    it('verifica, registra OPEN y devuelve 200 + pixel', async () => {
      tokens.verify.mockReturnValueOnce({ r: 'r1', o: 'o', t: 't', c: 'c' });
      const res = mockRes();
      await controller.open('tok', mockReq({ 'user-agent': 'UA' }), res);

      expect(tokens.verify).toHaveBeenCalledWith('tok');
      expect(track.record).toHaveBeenCalledWith(expect.objectContaining({
        type: 'OPEN', userAgent: 'UA',
      }));
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/gif');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalled();
    });

    it('token inválido NO leakea: igual responde 200 + pixel', async () => {
      tokens.verify.mockImplementationOnce(() => { throw new Error('bad jwt'); });
      const res = mockRes();
      await controller.open('bad', mockReq(), res);

      expect(track.record).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalled();
    });

    it('usa x-forwarded-for cuando está', async () => {
      tokens.verify.mockReturnValueOnce({ r: 'r', o: 'o', t: 't', c: 'c' });
      const res = mockRes();
      await controller.open('tok', mockReq({ 'x-forwarded-for': '8.8.8.8, 1.1.1.1' }), res);
      expect(track.record).toHaveBeenCalledWith(expect.objectContaining({ ip: '8.8.8.8' }));
    });
  });

  describe('GET /track/click', () => {
    it('verifica, registra CLICK y redirige 302 al destino', async () => {
      tokens.verify.mockReturnValueOnce({ r: 'r1', o: 'o', t: 't', c: 'c' });
      const res = mockRes();
      await controller.click('tok', 'https://example.com/x', mockReq(), res);

      expect(track.record).toHaveBeenCalledWith(expect.objectContaining({
        type: 'CLICK', targetUrl: 'https://example.com/x',
      }));
      expect(res.redirect).toHaveBeenCalledWith(302, 'https://example.com/x');
    });

    it('token inválido NO leakea: igual redirige 302', async () => {
      tokens.verify.mockImplementationOnce(() => { throw new Error('bad'); });
      const res = mockRes();
      await controller.click('bad', 'https://example.com/x', mockReq(), res);

      expect(track.record).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(302, 'https://example.com/x');
    });

    it('falta destino → BadRequest', async () => {
      const res = mockRes();
      await expect(controller.click('tok', '', mockReq(), res)).rejects.toThrow(/Falta parámetro u/);
    });
  });
});
