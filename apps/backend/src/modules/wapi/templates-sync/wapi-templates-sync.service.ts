import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@massivo/prisma';
import { TenantContext } from '../../../common/auth/tenant-context';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EncryptionService } from '../../../common/security/encryption.service';

const DEFAULT_API_VERSION = 'v20.0';
const MAX_PAGES = 5;
const PAGE_SIZE = 100;
const FETCH_FIELDS = 'name,status,language,category,components,id';

interface MetaTemplate {
  id?: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components?: unknown[];
}

interface MetaTemplatesPage {
  data?: MetaTemplate[];
  paging?: { next?: string; cursors?: { before?: string; after?: string } };
  error?: { code?: number; message?: string };
}

export interface SyncSummary {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  pages: number;
}

/**
 * Sync de message templates desde Meta Graph API hacia `WapiTemplate`.
 *
 * Flujo:
 *  1. Carga la `WapiConfig` por id via `prisma.scoped` — falla naturalmente
 *     cross-tenant.
 *  2. Decripta el `accessToken` con `EncryptionService`.
 *  3. Pagina por `paging.next` hasta `MAX_PAGES` (safety guard, ~500 templates).
 *  4. Por cada template: upsert por unique compound `(teamId, metaName,
 *     businessAccountId)`. No removemos existentes — si Meta los borra,
 *     quedan en BD con el último `status` conocido (manual cleanup vía DELETE).
 *
 * Usa fetch nativo (Node 22) — sin agregar deps. La URL base se override-a con
 * `WAPI_GRAPH_BASE_URL` para staging/mocks (mismo env que el sender).
 */
@Injectable()
export class WapiTemplatesSyncService {
  private readonly logger = new Logger(WapiTemplatesSyncService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant para sync de templates');
    }
    return ctx;
  }

  async sync(configId: string): Promise<SyncSummary> {
    const ctx = this.requireContext();
    const cfg = await this.prisma.scoped.wapiConfig.findFirst({
      where: { id: configId },
      select: {
        id: true,
        businessAccountId: true,
        accessTokenEnc: true,
      },
    });
    if (!cfg) {
      throw new NotFoundException(`WapiConfig ${configId} no encontrado en este scope`);
    }
    const accessToken = this.encryption.decrypt(cfg.accessTokenEnc);

    let url: string | undefined = this.firstPageUrl(cfg.businessAccountId);
    let pages = 0;
    const summary: SyncSummary = {
      fetched: 0, created: 0, updated: 0, skipped: 0, pages: 0,
    };

    while (url && pages < MAX_PAGES) {
      const page = await this.fetchPage(url, accessToken);
      pages += 1;
      const items = page.data ?? [];
      for (const tpl of items) {
        const result = await this.upsertOne(tpl, cfg.businessAccountId);
        summary.fetched += 1;
        if (result === 'created') summary.created += 1;
        else if (result === 'updated') summary.updated += 1;
        else summary.skipped += 1;
      }
      url = page.paging?.next;
    }

    summary.pages = pages;
    this.logger.log(
      `Templates sync config=${configId} team=${ctx.teamId}: pages=${summary.pages} fetched=${summary.fetched} created=${summary.created} updated=${summary.updated} skipped=${summary.skipped}`,
    );
    return summary;
  }

  private firstPageUrl(businessAccountId: string): string {
    const apiBase = this.config.get<string>('WAPI_GRAPH_BASE_URL') ?? 'https://graph.facebook.com';
    const version = DEFAULT_API_VERSION;
    const url = new URL(`${apiBase}/${version}/${businessAccountId}/message_templates`);
    url.searchParams.set('fields', FETCH_FIELDS);
    url.searchParams.set('limit', String(PAGE_SIZE));
    return url.toString();
  }

  private async fetchPage(url: string, accessToken: string): Promise<MetaTemplatesPage> {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = (await res.json().catch(() => ({}))) as MetaTemplatesPage;
    if (!res.ok) {
      const code = json.error?.code ?? res.status;
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      this.logger.warn(`Graph API templates ${res.status} code=${code}: ${msg}`);
      throw new ServiceUnavailableException(`Graph API templates: ${msg}`);
    }
    return json;
  }

  private async upsertOne(
    tpl: MetaTemplate,
    businessAccountId: string,
  ): Promise<'created' | 'updated' | 'skipped'> {
    if (!tpl.name) return 'skipped';
    const existing = await this.prisma.scoped.wapiTemplate.findFirst({
      where: { metaName: tpl.name, businessAccountId },
      select: {
        id: true,
        status: true,
        language: true,
        category: true,
        components: true,
      },
    });

    const data: Prisma.WapiTemplateUncheckedUpdateInput = {
      status: tpl.status,
      language: tpl.language,
      category: tpl.category,
      components: (tpl.components ?? []) as Prisma.InputJsonValue,
      syncedAt: new Date(),
    };

    if (!existing) {
      await this.prisma.scoped.wapiTemplate.create({
        data: {
          metaName: tpl.name,
          businessAccountId,
          status: tpl.status,
          language: tpl.language,
          category: tpl.category,
          components: (tpl.components ?? []) as Prisma.InputJsonValue,
          syncedAt: new Date(),
        } as Prisma.WapiTemplateUncheckedCreateInput,
      });
      return 'created';
    }

    // Si nada cambió, no escribimos (evita actualizar `syncedAt` por nada y
    // ahorra DB writes en el caso común de re-sync inocente).
    const sameStatus = existing.status === tpl.status;
    const sameLanguage = existing.language === tpl.language;
    const sameCategory = existing.category === tpl.category;
    const sameComponents =
      JSON.stringify(existing.components ?? []) === JSON.stringify(tpl.components ?? []);
    if (sameStatus && sameLanguage && sameCategory && sameComponents) {
      return 'skipped';
    }

    await this.prisma.scoped.wapiTemplate.update({ where: { id: existing.id }, data });
    return 'updated';
  }
}
