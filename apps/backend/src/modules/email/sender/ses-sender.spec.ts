/**
 * Tests del SesSender. Mockea SESv2Client.send para evitar AWS real.
 * Cubre: ensureConfigurationSet idempotente (cachea + no recrea si existe),
 * crea si NotFoundException, configSetName trunca a 64 chars, send retorna messageId.
 */
import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  GetConfigurationSetEventDestinationsCommand,
  GetConfigurationSetCommand,
  SendEmailCommand,
} from '@aws-sdk/client-sesv2';
import { SesSender } from './ses-sender';

jest.mock('@aws-sdk/client-sesv2', () => {
  const actual = jest.requireActual('@aws-sdk/client-sesv2');
  return {
    ...actual,
    SESv2Client: jest.fn(),
  };
});

import { SESv2Client } from '@aws-sdk/client-sesv2';

describe('SesSender', () => {
  let sendMock: jest.Mock;

  beforeEach(() => {
    sendMock = jest.fn();
    (SESv2Client as unknown as jest.Mock).mockImplementation(() => ({ send: sendMock }));
  });

  function makeSender() {
    return new SesSender({
      region: 'us-east-1',
      accessKeyId: 'a',
      secretAccessKey: 'b',
      configSetPrefix: 'massivo-team-',
    });
  }

  it('configSetName trunca a 64 chars', () => {
    const s = makeSender();
    const long = 'x'.repeat(80);
    expect(s.configSetName(long).length).toBe(64);
    expect(s.configSetName('abc')).toBe('massivo-team-abc');
  });

  it('ensureConfigurationSet: si existe, no crea', async () => {
    sendMock.mockResolvedValueOnce({}); // GetConfigurationSet OK
    const s = makeSender();
    const name = await s.ensureConfigurationSet('team-1');
    expect(name).toBe('massivo-team-team-1');
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]![0]).toBeInstanceOf(GetConfigurationSetCommand);
  });

  it('ensureConfigurationSet: NotFoundException → crea', async () => {
    const notFound = Object.assign(new Error('not found'), { name: 'NotFoundException' });
    sendMock.mockRejectedValueOnce(notFound);
    sendMock.mockResolvedValueOnce({});
    const s = makeSender();
    await s.ensureConfigurationSet('team-2');
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[1]![0]).toBeInstanceOf(CreateConfigurationSetCommand);
  });

  it('ensureConfigurationSet idempotente: 2da llamada no toca SES', async () => {
    sendMock.mockResolvedValueOnce({}); // 1ra: GetConfigurationSet OK
    const s = makeSender();
    await s.ensureConfigurationSet('team-3');
    await s.ensureConfigurationSet('team-3');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('send retorna messageId', async () => {
    sendMock.mockResolvedValueOnce({ MessageId: 'ses-msg-123' });
    const s = makeSender();
    const out = await s.send({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 's',
      html: '<p>h</p>',
      configurationSet: 'massivo-team-x',
    });
    expect(out).toEqual({ messageId: 'ses-msg-123', provider: 'ses' });
    expect(sendMock.mock.calls[0]![0]).toBeInstanceOf(SendEmailCommand);
  });

  describe('SNS event destination', () => {
    function makeSenderWithSns() {
      return new SesSender({
        region: 'us-east-1',
        accessKeyId: 'a',
        secretAccessKey: 'b',
        configSetPrefix: 'massivo-team-',
        eventsSnsTopicArn: 'arn:aws:sns:us-east-1:123:topic',
      });
    }

    it('config set existe sin event destination → crea destination', async () => {
      sendMock.mockResolvedValueOnce({}); // GetConfigurationSet OK
      sendMock.mockResolvedValueOnce({ EventDestinations: [] }); // GetEventDestinations vacío
      sendMock.mockResolvedValueOnce({}); // CreateEventDestination OK
      const s = makeSenderWithSns();
      await s.ensureConfigurationSet('team-1');
      expect(sendMock).toHaveBeenCalledTimes(3);
      expect(sendMock.mock.calls[2]![0]).toBeInstanceOf(CreateConfigurationSetEventDestinationCommand);
      const cmd = sendMock.mock.calls[2]![0] as CreateConfigurationSetEventDestinationCommand;
      expect(cmd.input.EventDestination?.MatchingEventTypes).toEqual(['BOUNCE', 'COMPLAINT', 'DELIVERY', 'OPEN', 'CLICK']);
      expect(cmd.input.EventDestination?.SnsDestination?.TopicArn).toBe('arn:aws:sns:us-east-1:123:topic');
    });

    it('event destination ya existe → no recrea', async () => {
      sendMock.mockResolvedValueOnce({}); // Get config set
      sendMock.mockResolvedValueOnce({ EventDestinations: [{ Name: 'massivo-sns' }] });
      const s = makeSenderWithSns();
      await s.ensureConfigurationSet('team-2');
      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(sendMock.mock.calls[1]![0]).toBeInstanceOf(GetConfigurationSetEventDestinationsCommand);
    });

    it('sin eventsSnsTopicArn → no chequea destination', async () => {
      sendMock.mockResolvedValueOnce({}); // Get config set
      const s = new SesSender({
        region: 'us-east-1', configSetPrefix: 'massivo-team-',
      });
      await s.ensureConfigurationSet('team-3');
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });

  it('send sin MessageId → tira', async () => {
    sendMock.mockResolvedValueOnce({});
    const s = makeSender();
    await expect(
      s.send({ from: 'a@b.com', to: 'c@d.com', subject: 's', html: 'h' }),
    ).rejects.toThrow(/MessageId/);
  });
});
