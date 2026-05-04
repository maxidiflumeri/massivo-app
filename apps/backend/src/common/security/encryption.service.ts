import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Servicio de encriptación de secretos at-rest. Diseñado tras una abstracción
 * para que un swap futuro a KMS (AWS, GCP, HashiCorp Vault) toque solo este
 * archivo, no los call sites.
 *
 * Formato de salida (string, parseable por #parse):
 *   v1:<iv-b64url>:<ciphertext-b64url>:<authTag-b64url>
 *
 * - v1: AES-256-GCM con master key de 32 bytes (256 bits) tomada de
 *   `MASSIVO_ENCRYPTION_KEY` (hex) o `MASSIVO_ENCRYPTION_KEY_B64` (base64).
 * - El IV es de 12 bytes (recomendado para GCM), generado random per-encrypt.
 * - El authTag (16 bytes) protege contra tampering: decrypt tira si fue
 *   modificado el ciphertext.
 *
 * Backward-compat: si el valor NO empieza con `v1:` se asume legacy plaintext
 * (datos sembrados durante 2.B) y se devuelve tal cual. Cuando se rote/edite
 * la WapiConfig, el create/update lo re-encripta.
 */
@Injectable()
export abstract class EncryptionService {
  abstract encrypt(plaintext: string): string;
  abstract decrypt(value: string): string;
  /** True si el valor ya está en un formato encriptado conocido (`v1:...`). */
  abstract isEncrypted(value: string): boolean;
}

const VERSION_V1 = 'v1';
const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 256;

interface CacheEntry {
  plaintext: string;
  expiresAt: number;
}

@Injectable()
export class AesGcmEncryptionService extends EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(AesGcmEncryptionService.name);
  private masterKey: Buffer | null = null;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: ConfigService) {
    super();
  }

  onModuleInit(): void {
    const hex = this.config.get<string>('MASSIVO_ENCRYPTION_KEY');
    const b64 = this.config.get<string>('MASSIVO_ENCRYPTION_KEY_B64');
    if (!hex && !b64) {
      this.logger.warn(
        'MASSIVO_ENCRYPTION_KEY no está seteada — encriptación deshabilitada (legacy mode). NO usar en producción.',
      );
      return;
    }
    const key = hex
      ? Buffer.from(hex, 'hex')
      : Buffer.from(b64 as string, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `MASSIVO_ENCRYPTION_KEY debe ser ${KEY_BYTES} bytes (got ${key.length}). Hex=${KEY_BYTES * 2} chars o base64=${Math.ceil((KEY_BYTES * 4) / 3)} chars.`,
      );
    }
    this.masterKey = key;
    this.logger.log(`AES-256-GCM encryption habilitada (key=${KEY_BYTES} bytes)`);
  }

  isEncrypted(value: string): boolean {
    return typeof value === 'string' && value.startsWith(`${VERSION_V1}:`);
  }

  /** True si el valor parece un payload encriptado (cualquier versión `vN:`). */
  private looksVersioned(value: string): boolean {
    return typeof value === 'string' && /^v\d+:/.test(value);
  }

  encrypt(plaintext: string): string {
    if (!this.masterKey) {
      // Modo legacy: sin clave master, persistimos plaintext. Esto sólo aplica
      // en dev sin la env seteada. Producción debe tirar al boot — el guard
      // queda en config validation (TODO).
      return plaintext;
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, this.masterKey, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION_V1,
      iv.toString('base64url'),
      enc.toString('base64url'),
      tag.toString('base64url'),
    ].join(':');
  }

  decrypt(value: string): string {
    if (!this.looksVersioned(value)) {
      // Legacy plaintext (sembrado en 2.B antes de 4.B) — devolver tal cual.
      return value;
    }
    const cached = this.cache.get(value);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.plaintext;
    }
    if (!this.masterKey) {
      throw new Error(
        'EncryptionService: valor encriptado pero MASSIVO_ENCRYPTION_KEY no está seteada',
      );
    }
    const parts = value.split(':');
    if (parts.length !== 4 || parts[0] !== VERSION_V1) {
      throw new Error(`EncryptionService: formato inválido (versión=${parts[0]})`);
    }
    const iv = Buffer.from(parts[1]!, 'base64url');
    const ct = Buffer.from(parts[2]!, 'base64url');
    const tag = Buffer.from(parts[3]!, 'base64url');
    if (iv.length !== IV_BYTES) {
      throw new Error(`EncryptionService: IV length inválido (${iv.length})`);
    }
    if (tag.length !== TAG_BYTES) {
      throw new Error(`EncryptionService: authTag length inválido (${tag.length})`);
    }
    const decipher = createDecipheriv(ALGO, this.masterKey, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
    const plaintext = dec.toString('utf8');
    this.rememberInCache(value, plaintext);
    return plaintext;
  }

  private rememberInCache(key: string, plaintext: string): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { plaintext, expiresAt: Date.now() + CACHE_TTL_MS });
  }
}
