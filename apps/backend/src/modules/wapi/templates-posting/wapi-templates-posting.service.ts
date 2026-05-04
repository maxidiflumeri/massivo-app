import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, WapiTemplate } from '@massivo/prisma';
import { TenantContext } from '../../../common/auth/tenant-context';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EncryptionService } from '../../../common/security/encryption.service';
import {
  CreateWapiTemplateMetaDto,
  TemplateButtonDto,
  TemplateHeaderDto,
} from './wapi-templates-posting.dto';

const DEFAULT_API_VERSION = 'v20.0';

interface MetaComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: string;
  text?: string;
  buttons?: Array<Record<string, unknown>>;
  example?: Record<string, unknown>;
}

interface MetaPayload {
  name: string;
  language: string;
  category: string;
  components: MetaComponent[];
}

interface MetaCreateResponse {
  id?: string;
  status?: string;
  category?: string;
  error?: { code?: number; message?: string };
}

/**
 * Crea un template en Meta vía Graph API y lo persiste localmente.
 *
 * Flujo:
 *  1. Carga `WapiConfig` por id (cross-tenant 404 natural).
 *  2. Verifica que no exista ya un template local con `(metaName, businessAccountId)`.
 *  3. Construye el payload Meta a partir del DTO (mapeo de header/body/footer/buttons).
 *  4. POST a `/v20.0/<wabaId>/message_templates` con `Authorization: Bearer <accessToken>`.
 *  5. Persiste local con `status` (típicamente `PENDING`) y `components` ya en
 *     formato Meta para que la UI los pueda renderizar igual que un template
 *     sincronizado.
 *
 * Nota sobre media headers: para format=IMAGE/VIDEO/DOCUMENT, Meta requiere un
 * `header_handle` obtenido vía Resumable Upload API (3-step: start, upload,
 * commit). Acá lo aceptamos como input — el frontend deberá obtenerlo en una
 * fase posterior (4.F.2.c). Por ahora si el usuario quiere mandar media, debe
 * pasar el `mediaHandle` ya generado.
 */
@Injectable()
export class WapiTemplatesPostingService {
  private readonly logger = new Logger(WapiTemplatesPostingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private requireContext() {
    const ctx = TenantContext.current();
    if (!ctx) {
      throw new ForbiddenException('No hay contexto de tenant para crear templates');
    }
    return ctx;
  }

  async submit(configId: string, dto: CreateWapiTemplateMetaDto): Promise<WapiTemplate> {
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

    const existing = await this.prisma.scoped.wapiTemplate.findFirst({
      where: { metaName: dto.name, businessAccountId: cfg.businessAccountId },
      select: { id: true, status: true },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un template con name='${dto.name}' en este WhatsApp Business Account`,
      );
    }

    const payload = this.buildMetaPayload(dto);
    const accessToken = this.encryption.decrypt(cfg.accessTokenEnc);

    const response = await this.postToMeta(cfg.businessAccountId, payload, accessToken);

    const created = await this.prisma.scoped.wapiTemplate.create({
      data: {
        metaName: dto.name,
        businessAccountId: cfg.businessAccountId,
        category: response.category ?? dto.category,
        language: dto.language,
        status: response.status ?? 'PENDING',
        components: payload.components as unknown as Prisma.InputJsonValue,
        syncedAt: new Date(),
      } as Prisma.WapiTemplateUncheckedCreateInput,
    });

    this.logger.log(
      `Template creado en Meta team=${ctx.teamId} config=${configId} name=${dto.name} metaId=${response.id ?? '?'} status=${response.status ?? 'PENDING'}`,
    );
    return created;
  }

  private buildMetaPayload(dto: CreateWapiTemplateMetaDto): MetaPayload {
    const components: MetaComponent[] = [];

    if (dto.header && dto.header.format !== 'NONE') {
      components.push(this.buildHeader(dto.header));
    }

    components.push({
      type: 'BODY',
      text: dto.body.text,
      ...(dto.body.examples && dto.body.examples.length > 0
        ? { example: { body_text: dto.body.examples } }
        : {}),
    });

    if (dto.footer) {
      components.push({ type: 'FOOTER', text: dto.footer.text });
    }

    if (dto.buttons && dto.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: dto.buttons.map((b) => this.buildButton(b)),
      });
    }

    return {
      name: dto.name,
      language: dto.language,
      category: dto.category,
      components,
    };
  }

  private buildHeader(header: TemplateHeaderDto): MetaComponent {
    if (header.format === 'TEXT') {
      if (!header.text) {
        throw new BadRequestException('header.text es requerido cuando format=TEXT');
      }
      const c: MetaComponent = { type: 'HEADER', format: 'TEXT', text: header.text };
      if (header.textExamples && header.textExamples.length > 0) {
        c.example = { header_text: header.textExamples };
      }
      return c;
    }
    // IMAGE / VIDEO / DOCUMENT
    if (!header.mediaHandle) {
      throw new BadRequestException(
        `header.mediaHandle es requerido cuando format=${header.format} (obtener vía Resumable Upload de Meta)`,
      );
    }
    return {
      type: 'HEADER',
      format: header.format,
      example: { header_handle: [header.mediaHandle] },
    };
  }

  private buildButton(b: TemplateButtonDto): Record<string, unknown> {
    if (b.type === 'URL') {
      if (!b.url) {
        throw new BadRequestException('button.url es requerido cuando type=URL');
      }
      return { type: 'URL', text: b.text, url: b.url };
    }
    if (b.type === 'PHONE_NUMBER') {
      if (!b.phoneNumber) {
        throw new BadRequestException('button.phoneNumber es requerido cuando type=PHONE_NUMBER');
      }
      return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phoneNumber };
    }
    return { type: 'QUICK_REPLY', text: b.text };
  }

  private async postToMeta(
    businessAccountId: string,
    payload: MetaPayload,
    accessToken: string,
  ): Promise<MetaCreateResponse> {
    const apiBase = this.config.get<string>('WAPI_GRAPH_BASE_URL') ?? 'https://graph.facebook.com';
    const url = `${apiBase}/${DEFAULT_API_VERSION}/${businessAccountId}/message_templates`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as MetaCreateResponse;
    if (!res.ok) {
      const code = json.error?.code ?? res.status;
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      this.logger.warn(`Graph API create-template ${res.status} code=${code}: ${msg}`);
      throw new ServiceUnavailableException(`Graph API create-template: ${msg}`);
    }
    return json;
  }
}
