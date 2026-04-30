import { BadRequestException } from '@nestjs/common';
import { SesWebhookController } from './ses-webhook.controller';

describe('SesWebhookController', () => {
  let validator: { validate: jest.Mock };
  let webhook: { process: jest.Mock };
  let controller: SesWebhookController;
  const fetchMock = jest.fn().mockResolvedValue({ ok: true });

  beforeEach(() => {
    validator = { validate: jest.fn().mockResolvedValue(undefined) };
    webhook = { process: jest.fn().mockResolvedValue(undefined) };
    controller = new SesWebhookController(validator as never, webhook as never);
    (globalThis as { fetch: unknown }).fetch = fetchMock;
    fetchMock.mockClear();
  });

  it('SubscriptionConfirmation: GET al SubscribeURL y 200', async () => {
    const r = await controller.handle({
      Type: 'SubscriptionConfirmation',
      MessageId: 'm', TopicArn: 'arn', Message: '', Timestamp: 't',
      SignatureVersion: '1', Signature: 'sig', SigningCertURL: 'u',
      SubscribeURL: 'https://sns.example.com/confirm',
    } as never);
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
    await controller.handle({
      Type: 'Notification',
      MessageId: 'm', TopicArn: 'arn', Message: JSON.stringify(sesEvent),
      Timestamp: 't', SignatureVersion: '1', Signature: 'sig', SigningCertURL: 'u',
    } as never);
    expect(webhook.process).toHaveBeenCalledWith(sesEvent);
  });

  it('firma inválida → tira (no procesa)', async () => {
    validator.validate.mockRejectedValueOnce(new Error('bad signature'));
    await expect(controller.handle({
      Type: 'Notification',
      MessageId: 'm', TopicArn: 'arn', Message: '{}', Timestamp: 't',
      SignatureVersion: '1', Signature: 'sig', SigningCertURL: 'u',
    } as never)).rejects.toThrow(/bad signature/);
    expect(webhook.process).not.toHaveBeenCalled();
  });

  it('Type ausente → BadRequest', async () => {
    await expect(controller.handle({} as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Notification con Message no-JSON → BadRequest', async () => {
    await expect(controller.handle({
      Type: 'Notification',
      MessageId: 'm', TopicArn: 'arn', Message: 'not-json', Timestamp: 't',
      SignatureVersion: '1', Signature: 'sig', SigningCertURL: 'u',
    } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('UnsubscribeConfirmation: 200 sin acción', async () => {
    const r = await controller.handle({
      Type: 'UnsubscribeConfirmation',
      MessageId: 'm', TopicArn: 'arn', Message: '', Timestamp: 't',
      SignatureVersion: '1', Signature: 'sig', SigningCertURL: 'u',
    } as never);
    expect(r).toEqual({ ok: true });
    expect(webhook.process).not.toHaveBeenCalled();
  });
});
