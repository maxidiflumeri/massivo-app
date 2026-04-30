import { Logger } from '@nestjs/common';
import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  GetConfigurationSetEventDestinationsCommand,
  GetConfigurationSetCommand,
  SendEmailCommand,
  SESv2Client,
} from '@aws-sdk/client-sesv2';
import type { EmailSender, SendEmailInput, SendEmailResult } from './email-sender';

export interface SesSenderConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  configSetPrefix: string;
  /** ARN del topic SNS al que SES publica los eventos. Si está vacío, no se configura event destination. */
  eventsSnsTopicArn?: string;
}

const EVENT_DESTINATION_NAME = 'massivo-sns';
const TRACKED_EVENT_TYPES = ['BOUNCE', 'COMPLAINT', 'DELIVERY', 'OPEN', 'CLICK'] as const;

/**
 * Sender SES v2. Compartido para todos los teams: la separación se hace
 * por configurationSet (uno por team, nombre estable {prefix}{teamId} truncado a 64).
 */
export class SesSender implements EmailSender {
  private readonly logger = new Logger(SesSender.name);
  private readonly client: SESv2Client;
  private readonly configSetPrefix: string;
  private readonly eventsSnsTopicArn: string | undefined;
  private readonly ensuredSets = new Set<string>();

  constructor(config: SesSenderConfig) {
    this.client = new SESv2Client({
      region: config.region,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
    });
    this.configSetPrefix = config.configSetPrefix;
    this.eventsSnsTopicArn = config.eventsSnsTopicArn;
  }

  /**
   * Idempotente: garantiza que existe el configuration set de un team.
   * Retorna el nombre canónico (truncado a 64 chars como exige SES).
   */
  async ensureConfigurationSet(teamId: string): Promise<string> {
    const name = this.configSetName(teamId);
    if (this.ensuredSets.has(name)) return name;

    try {
      await this.client.send(new GetConfigurationSetCommand({ ConfigurationSetName: name }));
    } catch (err) {
      const code = (err as { name?: string }).name;
      if (code !== 'NotFoundException') throw err;
      await this.client.send(new CreateConfigurationSetCommand({ ConfigurationSetName: name }));
      this.logger.log(`SES configuration set creado: ${name}`);
    }
    await this.ensureEventDestination(name);
    this.ensuredSets.add(name);
    return name;
  }

  /**
   * Idempotente: crea (si no existe) un event destination tipo SNS apuntando al topic
   * configurado, suscripto a Bounce/Complaint/Delivery/Open/Click. Si no hay topic ARN
   * configurado (env vacío) no hace nada — útil para ambientes dev sin SNS.
   */
  private async ensureEventDestination(configSetName: string): Promise<void> {
    if (!this.eventsSnsTopicArn) return;

    const existing = await this.client.send(
      new GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: configSetName }),
    );
    const already = (existing.EventDestinations ?? []).some(
      (d) => d.Name === EVENT_DESTINATION_NAME,
    );
    if (already) return;

    await this.client.send(
      new CreateConfigurationSetEventDestinationCommand({
        ConfigurationSetName: configSetName,
        EventDestinationName: EVENT_DESTINATION_NAME,
        EventDestination: {
          Enabled: true,
          MatchingEventTypes: [...TRACKED_EVENT_TYPES],
          SnsDestination: { TopicArn: this.eventsSnsTopicArn },
        },
      }),
    );
    this.logger.log(`SES event destination SNS creado en ${configSetName}`);
  }

  configSetName(teamId: string): string {
    const raw = `${this.configSetPrefix}${teamId}`;
    return raw.slice(0, 64);
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const out = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: input.from,
        Destination: { ToAddresses: [input.to] },
        Content: {
          Simple: {
            Subject: { Data: input.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: input.html, Charset: 'UTF-8' } },
          },
        },
        ConfigurationSetName: input.configurationSet,
      }),
    );
    if (!out.MessageId) throw new Error('SES SendEmail returned no MessageId');
    this.logger.debug(`ses send → ${input.to}: ${out.MessageId}`);
    return { messageId: out.MessageId, provider: 'ses' };
  }
}
