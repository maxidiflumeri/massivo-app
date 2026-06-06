import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createReadStream, type ReadStream } from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantContext } from '../../../common/auth/tenant-context';
import { EncryptionService } from '../../../common/security/encryption.service';
import {
  ALLOWED_MIMES_BY_TYPE,
  EXTENSION_BY_MIME,
  MEDIA_LIMITS_BY_TYPE,
  WapiMediaException,
  type WapiMediaDownloadResult,
  type WapiMediaType,
  type WapiMediaUploadInput,
  type WapiMediaUploadResult,
} from './wapi-media.types';

const DEFAULT_API_VERSION = 'v20.0';
const DEFAULT_GRAPH_BASE = 'https://graph.facebook.com';
const DEFAULT_MEDIA_DIR = './uploads/wapi-media';

interface GraphMediaUploadOk {
  id?: string;
}

interface GraphMediaInfoOk {
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
}

interface GraphErrorBody {
  error?: {
    code?: number;
    message?: string;
    type?: string;
  };
}

/**
 * Servicio único para upload (outbound) y download (inbound) de media via Meta
 * Cloud API. Mantiene un caché local en disco bajo `WAPI_MEDIA_DIR/<orgId>/<teamId>/`
 * con nombres `<sha256>.<ext>` para deduplicar entre conversaciones del mismo team.
 *
 * Por qué cacheamos:
 *  - Inbound: la URL temporal de Meta dura ~5 minutos. Sin caché, abrir un thread
 *    viejo muestra media rota.
 *  - Outbound: Meta retiene los media uploaded sólo ~30 días. Sin caché, el
 *    histórico no puede mostrar lo que enviamos.
 */
@Injectable()
export class WapiMediaService {
  private readonly logger = new Logger(WapiMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
  ) {}

  private get apiVersion(): string {
    return this.config.get<string>('META_GRAPH_API_VERSION') ?? DEFAULT_API_VERSION;
  }

  private get graphBase(): string {
    return this.config.get<string>('WAPI_GRAPH_BASE_URL') || DEFAULT_GRAPH_BASE;
  }

  private get mediaDir(): string {
    const dir = this.config.get<string>('WAPI_MEDIA_DIR') ?? DEFAULT_MEDIA_DIR;
    return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
  }

  /**
   * Resuelve la `WapiConfig` del tenant actual y devuelve un access token
   * desencriptado + el phone_number_id. Usar dentro de un `TenantContext.run`.
   */
  private async resolveConfig(configId: string): Promise<{
    phoneNumberId: string;
    accessToken: string;
    organizationId: string;
    teamId: string;
    isTestMode: boolean;
  }> {
    const ctx = TenantContext.current();
    if (!ctx) throw new WapiMediaException('Tenant context faltante', 'IO_ERROR');
    const cfg = await this.prisma.scoped.channel.findFirst({
      where: { id: configId },
      select: {
        phoneNumberId: true,
        accessTokenEnc: true,
        organizationId: true,
        teamId: true,
        isActive: true,
        isTestMode: true,
      },
    });
    if (!cfg) throw new WapiMediaException(`WapiConfig ${configId} no encontrado`, 'IO_ERROR');
    if (!cfg.isActive) throw new WapiMediaException('WapiConfig deshabilitada', 'IO_ERROR');
    return {
      phoneNumberId: cfg.phoneNumberId!,
      // En test mode el accessToken puede ser un placeholder no encriptado (ej
      // creado vía seed dev). Evitamos el decrypt para no romper resolveConfig.
      accessToken: cfg.isTestMode ? 'SIM_TOKEN' : this.encryption.decrypt(cfg.accessTokenEnc),
      organizationId: cfg.organizationId,
      teamId: cfg.teamId,
      isTestMode: cfg.isTestMode,
    };
  }

  validateUpload(type: WapiMediaType, mime: string, size: number): void {
    const allowed = ALLOWED_MIMES_BY_TYPE[type];
    if (!allowed.has(mime)) {
      throw new WapiMediaException(
        `Mime "${mime}" no permitido para type=${type}. Permitidos: ${[...allowed].join(', ')}`,
        'INVALID_MIME',
      );
    }
    const limit = MEDIA_LIMITS_BY_TYPE[type];
    if (size > limit) {
      throw new WapiMediaException(
        `Archivo de ${size} bytes excede el límite de ${limit} bytes para type=${type}`,
        'TOO_LARGE',
      );
    }
  }

  /**
   * Upload de media outbound. Sube a Meta y persiste copia local indexada por
   * sha256. Si el sha256 ya existe en el storage del team, no re-escribe.
   */
  async uploadToMeta(input: WapiMediaUploadInput): Promise<WapiMediaUploadResult> {
    this.validateUpload(input.type, input.mime, input.buffer.length);

    const cfg = await this.resolveConfig(input.configId);
    const sha256 = createHash('sha256').update(input.buffer).digest('hex');
    const ext = EXTENSION_BY_MIME[input.mime] ?? 'bin';
    const localPath = await this.persistLocal(
      cfg.organizationId,
      cfg.teamId,
      sha256,
      ext,
      input.buffer,
    );

    // 4.P.3 — En test mode no pegamos a Meta. Devolvemos un mediaId `SIM_<sha-prefix>`
    // (mismo prefijo que usa el sender en test mode) y persistimos solo el archivo
    // local. Esto permite que flows con MEDIA_FROM_URL corran end-to-end en dev
    // sin Meta real ni accessToken válido.
    if (cfg.isTestMode) {
      const simId = `SIM_${sha256.slice(0, 16)}`;
      this.logger.debug(`Media upload SIM (isTestMode) mediaId=${simId} sha256=${sha256.slice(0, 12)}…`);
      return {
        mediaId: simId,
        sha256,
        size: input.buffer.length,
        localPath: this.toRelative(localPath),
      };
    }

    const url = `${this.graphBase}/${this.apiVersion}/${cfg.phoneNumberId}/media`;
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', input.mime);
    form.append(
      'file',
      new Blob([new Uint8Array(input.buffer)], { type: input.mime }),
      input.filename,
    );

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      const err = (json as GraphErrorBody).error;
      this.logger.warn(`Meta upload ${res.status}: ${err?.message ?? 'unknown'}`);
      throw new WapiMediaException(
        `Meta upload failed: ${err?.message ?? `HTTP ${res.status}`}`,
        'META_UPLOAD_FAILED',
        json,
      );
    }
    const ok = json as GraphMediaUploadOk;
    if (!ok.id) {
      throw new WapiMediaException('Meta upload OK sin id', 'META_UPLOAD_FAILED', json);
    }
    this.logger.debug(`Media uploaded mediaId=${ok.id} sha256=${sha256.slice(0, 12)}…`);
    return {
      mediaId: ok.id,
      sha256,
      size: input.buffer.length,
      localPath: this.toRelative(localPath),
    };
  }

  /**
   * Descarga media inbound por mediaId. Resuelve URL temporal contra Graph,
   * baja el binario, persiste local. Idempotente: si ya tenemos el sha256 en
   * disco, no re-baja.
   */
  async fetchInboundMedia(configId: string, mediaId: string): Promise<WapiMediaDownloadResult> {
    const cfg = await this.resolveConfig(configId);

    const infoUrl = `${this.graphBase}/${this.apiVersion}/${mediaId}`;
    const infoRes = await fetch(infoUrl, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    });
    const infoJson = (await infoRes.json().catch(() => ({}))) as unknown;
    if (!infoRes.ok) {
      const err = (infoJson as GraphErrorBody).error;
      throw new WapiMediaException(
        `Meta media info failed: ${err?.message ?? `HTTP ${infoRes.status}`}`,
        'META_FETCH_FAILED',
        infoJson,
      );
    }
    const info = infoJson as GraphMediaInfoOk;
    if (!info.url || !info.mime_type) {
      throw new WapiMediaException('Meta media info sin url/mime_type', 'META_FETCH_FAILED', info);
    }

    const binRes = await fetch(info.url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    });
    if (!binRes.ok) {
      throw new WapiMediaException(
        `Meta media binary failed: HTTP ${binRes.status}`,
        'META_FETCH_FAILED',
      );
    }
    const arrBuf = await binRes.arrayBuffer();
    const buffer = Buffer.from(arrBuf);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const ext = EXTENSION_BY_MIME[info.mime_type] ?? 'bin';
    const localPath = await this.persistLocal(
      cfg.organizationId,
      cfg.teamId,
      sha256,
      ext,
      buffer,
    );

    return {
      sha256,
      size: buffer.length,
      mime: info.mime_type,
      localPath: this.toRelative(localPath),
    };
  }

  /**
   * Persiste un buffer al storage local del tenant resuelto desde `configId`,
   * sin tocar Meta. Usado por el Dev Simulator para inyectar media inbound
   * fake. Devuelve el shape que esperaría `fetchInboundMedia`.
   */
  async persistInboundLocal(
    configId: string,
    buffer: Buffer,
    mime: string,
  ): Promise<WapiMediaDownloadResult> {
    const cfg = await this.resolveConfig(configId);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const ext = EXTENSION_BY_MIME[mime] ?? 'bin';
    const abs = await this.persistLocal(
      cfg.organizationId,
      cfg.teamId,
      sha256,
      ext,
      buffer,
    );
    return {
      sha256,
      size: buffer.length,
      mime,
      localPath: this.toRelative(abs),
    };
  }

  /**
   * Abre stream de lectura sobre un media local. Resuelve `relativePath` (lo
   * que persistimos en `WapiMessage.mediaLocalPath`) contra `WAPI_MEDIA_DIR`.
   */
  async openLocal(
    relativePath: string,
  ): Promise<{ stream: ReadStream; size: number; absPath: string }> {
    const absPath = this.resolveAbs(relativePath);
    const stat = await fs.stat(absPath).catch(() => {
      throw new WapiMediaException(`Media local no encontrado: ${relativePath}`, 'IO_ERROR');
    });
    if (!stat.isFile()) {
      throw new WapiMediaException(`Media local no es un archivo: ${relativePath}`, 'IO_ERROR');
    }
    return { stream: createReadStream(absPath), size: stat.size, absPath };
  }

  private async persistLocal(
    organizationId: string,
    teamId: string,
    sha256: string,
    ext: string,
    buffer: Buffer,
  ): Promise<string> {
    const dir = path.join(this.mediaDir, organizationId, teamId);
    await fs.mkdir(dir, { recursive: true });
    const fullPath = path.join(dir, `${sha256}.${ext}`);
    try {
      await fs.access(fullPath);
      // Ya existe: no re-escribir.
    } catch {
      await fs.writeFile(fullPath, buffer);
    }
    return fullPath;
  }

  private toRelative(absPath: string): string {
    const rel = path.relative(this.mediaDir, absPath);
    // Normalizar separadores a `/` para portabilidad en DB.
    return rel.split(path.sep).join('/');
  }

  private resolveAbs(relativePath: string): string {
    // Sanity: no permitir escapes con `..`.
    const normalized = path.normalize(relativePath);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new WapiMediaException(`Path inválido: ${relativePath}`, 'IO_ERROR');
    }
    return path.join(this.mediaDir, normalized);
  }
}
