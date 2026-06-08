import { BadRequestException } from '@nestjs/common';
import { SesWebhookController } from './ses-webhook.controller';

const noopEventLogger = new Proxy({}, { get: () => () => undefined }) as never;

// SNS publica con Content-Type text/plain → el controller lee `req.rawBody`
// (Buffer) y hace JSON.parse manual. Replicamos ese shape de request.
function req(msg: unknown): never {
  return { rawBody: Buffer.from(JSON.stringify(msg), 'utf-8') } as never;
}

describe('SesWebhookController', () => {
  let validator: { validate: jest.Mock };
  let webhook: { process: jest.Mock };
  let controller: SesWebhookController;
  const fetchMock = jest.fn().mockResolvedValue({ ok: true });

  beforeEach(() => {
    validator = { validate: jest.fn().mockResolvedValue(undefined) };
    webhook = { process: jest.fn().mockResolvedValue(undefined) };
    controller = new SesWebhookController(validator as never, webhook as never, noopEventLogger);
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    fetchMock.mockClear();
  });

  it('SubscriptionConfirmation: GET al SubscribeURL y 200', async () => {
    const r = await controller.handle(req({
      Type: 'SubscriptionConfirmation',
      MessageId: 'm', TopicArn: 'arn', Message: '', Timestamp: 't',
      SignatureVersion: '1', Signature: 'sig', SigningCertURL: 'u',
      SubscribeURL: 'https://sns.example.com/confirm',
    }));
    expect(r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('https://sns.example.com/confirm');
    expect(webhook.process).not.toHaveBeenCalled();
  });

  it('Notification: parsea Message y delega al service', async () => {
    const sesEvent = {
      eventType: 'Bounce',
      mail: { messageId: 'mid-1', destination: ['a@b.com'] },
      bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'a@b.com' }], timestamp: 't' },
    };
    await controller.handle(req({
      Type: 'Notification',
      MessageId: 'm', TopicArn: 'arn', Message: JSON.stringify(sesEvent),
      Timestamp: 't', SignatureVersion: '1', Signature: 'sig', SigningCertURL: 'u',
    }));
    expect(webhook.process).toHaveBeenCalledWith(sesEvent);
  });

  it('firma inválida → tira (no procesa)', async () => {
    validator.validate.mockRejectedValueOnce(new Error('bad signature'));
    await expect(controller.handle(req({
      Type: 'Notification',
      MessageId: 'm', TopicArn: 'arn', Message: '{}', Timestamp: 't',
      SignatureVersion: '1', Signature: 'sig', SigningCertURL: 'u',
    }))).rejects.toThrow(/bad signature/);
    expect(webhook.process).not.toHaveBeenCalled();
  });

  it('Type ausente → BadRequest', async () => {
    await expect(controller.handle(req({}))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Notification con Message no-JSON → BadRequest', async () => {
    await expect(controller.handle(req({
      Type: 'Notification',
      MessageId: 'm', TopicArn: 'arn', Message: 'not-json', Timestamp: 't',
      SignatureVersion: '1', Signature: 'sig', SigningCertURL: 'u',
    }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('UnsubscribeConfirmation: 200 sin acción', async () => {
    const r = await controller.handle(req({
      Type: 'UnsubscribeConfirmation',
      MessageId: 'm', TopicArn: 'arn', Message: '', Timestamp: 't',
      SignatureVersion: '1', Signature: 'sig', SigningCertURL: 'u',
    }));
    expect(r).toEqual({ ok: true });
    expect(webhook.process).not.toHaveBeenCalled();
  });
});
