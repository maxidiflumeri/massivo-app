import { Logger } from '@nestjs/common';
import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  GetAccountCommand,
  GetConfigurationSetEventDestinationsCommand,
  GetConfigurationSetCommand,
  SendEmailCommand,
  SESv2Client,
} from '@aws-sdk/client-sesv2';
import MailComposer from 'nodemailer/lib/mail-composer';
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
      try {
        await this.client.send(new CreateConfigurationSetCommand({ ConfigurationSetName: name }));
        this.logger.log(`SES configuration set creado: ${name}`);
      } catch (createErr) {
        // Race condition: 2 workers paralelos pasan el Get→NotFoundException,
        // ambos llaman Create. El segundo recibe "AlreadyExistsException". Es
        // semánticamente OK — el set existe, sólo no lo creamos nosotros.
        const createCode = (createErr as { name?: string }).name;
        if (createCode !== 'AlreadyExistsException') throw createErr;
        this.logger.debug(`SES configuration set ${name} ya existía (race condition tolerada)`);
      }
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

  async verify(): Promise<void> {
    await this.client.send(new GetAccountCommand({}));
  }

  configSetName(teamId: string): string {
    const raw = `${this.configSetPrefix}${teamId}`;
    return raw.slice(0, 64);
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const hasAttachments = !!input.attachments && input.attachments.length > 0;

    // Camino A: con adjuntos → SES Content.Raw con MIME armado por MailComposer.
    // SES v2 Simple no soporta attachments; Raw acepta MIME message completo
    // base64-encoded. nodemailer's MailComposer ya genera MIME multipart con
    // encoding, boundaries y charset correctos — evita escapeo manual.
    if (hasAttachments) {
      const composer = new MailComposer({
        from: input.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
        attachments: input.attachments!.map((a) => ({
          filename: a.filename,
          content: a.content,
          ...(a.contentType ? { contentType: a.contentType } : {}),
        })),
      });
      const raw: Buffer = await new Promise((resolve, reject) => {
        composer.compile().build((err, message) => {
          if (err) reject(err);
          else resolve(message);
        });
      });

      const out = await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: input.from,
          Destination: { ToAddresses: [input.to] },
          Content: { Raw: { Data: raw } },
          ConfigurationSetName: input.configurationSet,
        }),
      );
      if (!out.MessageId) throw new Error('SES SendEmail Raw returned no MessageId');
      this.logger.debug(
        `ses send (raw +${input.attachments!.length} attachments) → ${input.to}: ${out.MessageId}`,
      );
      return { messageId: out.MessageId, provider: 'ses' };
    }

    // Camino B (default): sin adjuntos → Content.Simple. Más liviano, más
    // performante. Cubre el 99% de los casos (campañas bulk de marketing).
    // SES v2 SimpleContent acepta Headers como array {Name, Value}. Lo usamos
    // para inyectar List-Unsubscribe + List-Unsubscribe-Post (requeridos por
    // Gmail/Yahoo 2024 para envíos bulk > 5k/día) y cualquier header custom
    // que el caller quiera setear.
    const headers = input.headers
      ? Object.entries(input.headers).map(([Name, Value]) => ({ Name, Value }))
      : undefined;

    const out = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: input.from,
        Destination: { ToAddresses: [input.to] },
        // SES v2: ReplyToAddresses se setea a nivel command, no como header.
        // Si está vacío AWS no agrega Reply-To al mail.
        ...(input.replyTo ? { ReplyToAddresses: [input.replyTo] } : {}),
        Content: {
          Simple: {
            Subject: { Data: input.subject, Charset: 'UTF-8' },
            Body: { Html: { Data: input.html, Charset: 'UTF-8' } },
            Headers: headers,
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
