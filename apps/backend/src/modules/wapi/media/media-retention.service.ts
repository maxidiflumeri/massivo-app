import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const TICK_MS = 6 * 60 * 60_000; // 6 h
const FIRST_TICK_MS = 120_000; // no competir con el arranque
const DEFAULT_RETENTION_DAYS = 30;
/** Los de 0 bytes son basura de escrituras fallidas: se barren enseguida. */
const EMPTY_FILE_GRACE_MS = 60 * 60_000; // 1 h

/**
 * Poda del directorio de media (`WAPI_MEDIA_DIR`).
 *
 * El directorio nació para la media ENTRANTE — una foto que manda un ciudadano
 * se guarda para que el operador la vea en el inbox — pero nada la borraba
 * nunca. Con el bot en producción llegó a 18 GB y llenó el disco dos veces en
 * una semana, y como lo primero que falla con el disco lleno es escribir un
 * archivo nuevo, lo que se rompía era justamente el envío de cupones.
 *
 * El grueso del volumen (los PDFs que el bot baja para reenviar) ya no se
 * persiste — ver `persist` en `WapiMediaUploadInput`. Esto es la red de
 * seguridad para el resto: media entrante vieja, archivos huérfanos y los de 0
 * bytes que dejan las escrituras fallidas.
 *
 * Nota: no toca la DB. Un `Message.mediaLocalPath` puede quedar apuntando a un
 * archivo ya borrado; el endpoint de media del inbox devuelve 404 en ese caso.
 */
@Injectable()
export class MediaRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaRetentionService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstTimer: NodeJS.Timeout | null = null;

  private get mediaDir(): string {
    return process.env.WAPI_MEDIA_DIR ?? path.join(process.cwd(), 'uploads', 'wapi-media');
  }

  private get retentionDays(): number {
    const raw = Number(process.env.MEDIA_RETENTION_DAYS);
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_RETENTION_DAYS;
  }

  onModuleInit() {
    this.firstTimer = setTimeout(() => void this.safeTick(), FIRST_TICK_MS);
    if (typeof this.firstTimer.unref === 'function') this.firstTimer.unref();
    this.timer = setInterval(() => void this.safeTick(), TICK_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  onModuleDestroy() {
    if (this.firstTimer) clearTimeout(this.firstTimer);
    if (this.timer) clearInterval(this.timer);
    this.firstTimer = null;
    this.timer = null;
  }

  private async safeTick(): Promise<void> {
    try {
      await this.tick();
    } catch (err) {
      this.logger.warn(`tick falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async tick(): Promise<{ deleted: number; freedBytes: number }> {
    const now = Date.now();
    const cutoff = now - this.retentionDays * 24 * 60 * 60 * 1000;
    const emptyCutoff = now - EMPTY_FILE_GRACE_MS;
    let deleted = 0;
    let freedBytes = 0;

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // el directorio puede no existir todavía
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          // Directorio de org/team que quedó vacío: se limpia también.
          await fs.rmdir(full).catch(() => undefined);
          continue;
        }
        if (!entry.isFile()) continue;
        const stat = await fs.stat(full).catch(() => null);
        if (!stat) continue;
        const vencido = stat.mtimeMs < cutoff;
        const vacio = stat.size === 0 && stat.mtimeMs < emptyCutoff;
        if (!vencido && !vacio) continue;
        if (await fs.unlink(full).then(() => true).catch(() => false)) {
          deleted++;
          freedBytes += stat.size;
        }
      }
    };

    await walk(this.mediaDir);
    if (deleted > 0) {
      this.logger.log(
        `media: ${deleted} archivo(s) purgado(s), ${(freedBytes / 1_048_576).toFixed(1)} MB ` +
          `liberados (retención ${this.retentionDays} días)`,
      );
    }
    return { deleted, freedBytes };
  }
}
