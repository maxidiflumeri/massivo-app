import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AUDIT_METADATA_KEY, AuditOptions } from './audit.decorator';

describe('AuditInterceptor', () => {
  let reflector: { get: jest.Mock };
  let auditLog: { log: jest.Mock };
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };
    interceptor = new AuditInterceptor(reflector as never, auditLog as never);
  });

  function makeCtx(req: Partial<{ params: Record<string, unknown>; body: unknown; ip: string; headers: Record<string, unknown> }>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
    } as never;
  }

  it('sin @Audit en el handler → no escribe nada', async () => {
    reflector.get.mockReturnValue(undefined);
    const handler: CallHandler = { handle: () => of({ id: 'x' }) };
    await firstValueFrom(interceptor.intercept(makeCtx({}), handler));
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('con @Audit + response:id → loggea con resourceId tomado de la respuesta', async () => {
    const opts: AuditOptions = { action: 'wapi.campaign.created', resourceType: 'WapiCampaign', resourceIdFrom: 'response:id' };
    reflector.get.mockReturnValue(opts);
    const req = { params: {}, body: { name: 'C1' }, ip: '10.0.0.1', headers: { 'user-agent': 'jest' } };
    const handler: CallHandler = { handle: () => of({ id: 'cmp-123', status: 'DRAFT' }) };
    await firstValueFrom(interceptor.intercept(makeCtx(req), handler));
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'wapi.campaign.created',
      resourceType: 'WapiCampaign',
      resourceId: 'cmp-123',
      ip: '10.0.0.1',
      userAgent: 'jest',
      metadata: expect.objectContaining({ body: { name: 'C1' } }),
    }));
  });

  it('param:id → toma de req.params', async () => {
    reflector.get.mockReturnValue({ action: 'wapi.campaign.sent', resourceIdFrom: 'param:id' });
    const req = { params: { id: 'cmp-9' }, body: {}, headers: {} };
    const handler: CallHandler = { handle: () => of({ enqueued: 5 }) };
    await firstValueFrom(interceptor.intercept(makeCtx(req), handler));
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 'cmp-9' }));
  });

  it('si el handler tira, NO escribe audit', async () => {
    reflector.get.mockReturnValue({ action: 'x' });
    const handler: CallHandler = { handle: () => throwError(() => new Error('boom')) };
    await expect(
      firstValueFrom(interceptor.intercept(makeCtx({ headers: {} }), handler)),
    ).rejects.toThrow('boom');
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('respeta x-forwarded-for para extraer IP', async () => {
    reflector.get.mockReturnValue({ action: 'x' });
    const req = { params: {}, body: {}, headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1', 'user-agent': 'ua' } };
    const handler: CallHandler = { handle: () => of({}) };
    await firstValueFrom(interceptor.intercept(makeCtx(req), handler));
    expect(auditLog.log).toHaveBeenCalledWith(expect.objectContaining({ ip: '203.0.113.5' }));
  });

  it('includeBody:false omite el body del metadata', async () => {
    reflector.get.mockReturnValue({ action: 'x', includeBody: false });
    const req = { params: { id: 'a' }, body: { huge: 'payload' }, headers: {} };
    const handler: CallHandler = { handle: () => of({}) };
    await firstValueFrom(interceptor.intercept(makeCtx(req), handler));
    const call = auditLog.log.mock.calls[0][0];
    expect(call.metadata?.body).toBeUndefined();
    expect(call.metadata?.params).toEqual({ id: 'a' });
  });
});
