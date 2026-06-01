import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  SESv2Client,
} from '@aws-sdk/client-sesv2';

/** Status crudo que devuelve SES en `DkimAttributes.Status`. */
export type SesDkimStatus =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'TEMPORARY_FAILURE'
  | 'NOT_STARTED';

export interface SesDkimToken {
  /** Nombre del registro CNAME relativo al dominio. Ej: `selector1._domainkey`. */
  name: string;
  /** Valor del registro CNAME. Ej: `selector1.dkim.amazonses.com`. */
  value: string;
}

export interface SesDomainIdentity {
  domain: string;
  dkimStatus: SesDkimStatus;
  dkimTokens: SesDkimToken[];
  /** `true` cuando SES habilitó el envío para el dominio (DKIM + ownership verificados). */
  verifiedForSending: boolean;
}

/**
 * Wrapper sobre AWS SESv2 para gestionar **domain identities** — el ciclo de
 * alta, lectura de estado y baja de los dominios verificados por DKIM (Easy
 * DKIM RSA-2048, default de SES).
 *
 * Sólo este servicio habla con SES en la feature de Email Domains; el resto
 * del backend opera contra `EmailDomain` en la DB.
 *
 * Credenciales: usa el default provider chain del SDK (instance profile en EC2,
 * `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` en dev local si están seteados).
 */
@Injectable()
export class SesDomainsService {
  private readonly logger = new Logger(SesDomainsService.name);
  private readonly client: SESv2Client;

  constructor(private readonly config: ConfigService) {
    this.client = new SESv2Client({
      region: this.config.get<string>('AWS_REGION') ?? 'us-east-1',
      // Si se setean explícitas en env las usa; si no, el SDK cae en instance
      // profile / sso / shared credentials por orden default.
      credentials:
        this.config.get<string>('AWS_ACCESS_KEY_ID') &&
        this.config.get<string>('AWS_SECRET_ACCESS_KEY')
          ? {
              accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID')!,
              secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY')!,
            }
          : undefined,
    });
  }

  /**
   * Registra un dominio en SES con Easy DKIM. SES genera 3 selectores RSA y
   * los devuelve como tokens — el cliente debe agregar los 3 CNAMEs en su DNS
   * (`{token}._domainkey.{domain}` → `{token}.dkim.amazonses.com`).
   *
   * Idempotente: si `CreateEmailIdentity` falla con `AlreadyExistsException`
   * (el dominio ya está registrado en nuestra account, ej. por una corrida
   * anterior), hacemos un `GetEmailIdentity` y devolvemos los tokens vigentes.
   */
  async createIdentity(domain: string): Promise<SesDomainIdentity> {
    const normalized = domain.toLowerCase().trim();
    try {
      const res = await this.client.send(
        new CreateEmailIdentityCommand({
          EmailIdentity: normalized,
          // Default: Easy DKIM RSA-2048 — no hace falta pasar DkimSigningAttributes.
        }),
      );
      const tokens = (res.DkimAttributes?.Tokens ?? []).map((t) =>
        toDkimToken(t),
      );
      const dkimStatus = (res.DkimAttributes?.Status ?? 'NOT_STARTED') as SesDkimStatus;
      this.logger.log(`SES identity creada: ${normalized} (${tokens.length} tokens, status=${dkimStatus})`);
      return {
        domain: normalized,
        dkimStatus,
        dkimTokens: tokens,
        verifiedForSending: res.VerifiedForSendingStatus === true,
      };
    } catch (err) {
      if (isAwsAlreadyExists(err)) {
        this.logger.warn(`SES identity ${normalized} ya existía — leyendo tokens vigentes`);
        return this.getIdentity(normalized);
      }
      throw err;
    }
  }

  /**
   * Lee el estado actual de un dominio. Lo llamamos en cada poll para
   * refrescar `EmailDomain.status` desde SES.
   */
  async getIdentity(domain: string): Promise<SesDomainIdentity> {
    const normalized = domain.toLowerCase().trim();
    const res = await this.client.send(
      new GetEmailIdentityCommand({ EmailIdentity: normalized }),
    );
    const tokens = (res.DkimAttributes?.Tokens ?? []).map((t) => toDkimToken(t));
    const dkimStatus = (res.DkimAttributes?.Status ?? 'NOT_STARTED') as SesDkimStatus;
    return {
      domain: normalized,
      dkimStatus,
      dkimTokens: tokens,
      verifiedForSending: res.VerifiedForSendingStatus === true,
    };
  }

  /**
   * Borra el dominio en SES. Si ya no existe, lo tratamos como éxito (la
   * intención del caller es "que no exista"). Cualquier otro error se
   * propaga.
   */
  async deleteIdentity(domain: string): Promise<void> {
    const normalized = domain.toLowerCase().trim();
    try {
      await this.client.send(
        new DeleteEmailIdentityCommand({ EmailIdentity: normalized }),
      );
      this.logger.log(`SES identity borrada: ${normalized}`);
    } catch (err) {
      if (isAwsNotFound(err)) {
        this.logger.warn(`SES identity ${normalized} no existía al borrar — no-op`);
        return;
      }
      throw err;
    }
  }
}

/** Transforma un token SES (string) en `{ name, value }` CNAME ready-to-display. */
function toDkimToken(token: string): SesDkimToken {
  return {
    name: `${token}._domainkey`,
    value: `${token}.dkim.amazonses.com`,
  };
}

function isAwsAlreadyExists(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'AlreadyExistsException'
  );
}

function isAwsNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'NotFoundException'
  );
}
