/**
 * Tests del MediaRetentionService: la red de seguridad que evita que el
 * directorio de media vuelva a llenar el disco.
 */
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MediaRetentionService } from './media-retention.service';

describe('MediaRetentionService', () => {
  let svc: MediaRetentionService;
  let tmpDir: string;
  const DIA = 24 * 60 * 60 * 1000;

  /** Crea un archivo con mtime y tamaño controlados. */
  async function crear(rel: string, bytes: number, edadMs: number) {
    const full = path.join(tmpDir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, Buffer.alloc(bytes));
    const t = new Date(Date.now() - edadMs);
    await fs.utimes(full, t, t);
    return full;
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-ret-test-'));
    process.env.WAPI_MEDIA_DIR = tmpDir;
    process.env.MEDIA_RETENTION_DAYS = '30';
    svc = new MediaRetentionService();
  });

  afterEach(async () => {
    delete process.env.WAPI_MEDIA_DIR;
    delete process.env.MEDIA_RETENTION_DAYS;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('borra lo vencido y conserva lo reciente', async () => {
    const viejo = await crear('org1/team1/viejo.pdf', 1024, 40 * DIA);
    const nuevo = await crear('org1/team1/nuevo.pdf', 1024, 2 * DIA);

    const { deleted, freedBytes } = await svc.tick();

    expect(deleted).toBe(1);
    expect(freedBytes).toBe(1024);
    await expect(fs.stat(viejo)).rejects.toThrow();
    await expect(fs.stat(nuevo)).resolves.toBeDefined();
  });

  it('barre los archivos de 0 bytes aunque sean recientes', async () => {
    // Los deja una escritura que falló por disco lleno: basura pura.
    const vacio = await crear('org1/team1/fallido.pdf', 0, 3 * 60 * 60 * 1000);
    const vacioReciente = await crear('org1/team1/enCurso.pdf', 0, 60 * 1000);

    const { deleted } = await svc.tick();

    expect(deleted).toBe(1);
    await expect(fs.stat(vacio)).rejects.toThrow();
    // Uno de hace un minuto puede ser una escritura en curso: no se toca.
    await expect(fs.stat(vacioReciente)).resolves.toBeDefined();
  });

  it('con retención 0 purga todo', async () => {
    process.env.MEDIA_RETENTION_DAYS = '0';
    await crear('org1/team1/a.pdf', 10, 60_000);
    await crear('org1/team1/b.jpg', 20, 60_000);

    const { deleted } = await svc.tick();

    expect(deleted).toBe(2);
  });

  it('no explota si el directorio no existe', async () => {
    process.env.WAPI_MEDIA_DIR = path.join(tmpDir, 'no-existe');
    await expect(svc.tick()).resolves.toEqual({ deleted: 0, freedBytes: 0 });
  });
});
