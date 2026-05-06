import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AppAbility } from '@massivo/permissions';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import { WapiInboxService } from './wapi-inbox.service';
import { WapiMediaService } from '../media/wapi-media.service';
import { MEDIA_LIMITS_BY_TYPE } from '../media/wapi-media.types';
import {
  AssignWapiConversationDto,
  ListWapiConversationsQueryDto,
  ListWapiMessagesQueryDto,
  MarkReadStateDto,
  ResolveWapiConversationDto,
  SendWapiInboxMediaDto,
  SendWapiInboxTextDto,
} from './wapi-inbox.dto';

// Cap superior global para multer (100 MB = el mayor de los limites por tipo).
// La validación fina por tipo la hace WapiMediaService.validateUpload.
const MAX_UPLOAD_BYTES = Math.max(...Object.values(MEDIA_LIMITS_BY_TYPE));

@Controller('wapi/inbox')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class WapiInboxController {
  constructor(
    private readonly service: WapiInboxService,
    private readonly mediaService: WapiMediaService,
  ) {}

  @Get('conversations')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  list(@Query() query: ListWapiConversationsQueryDto) {
    return this.service.listConversations(query);
  }

  @Get('conversations/:id')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  getOne(@Param('id') id: string) {
    return this.service.getConversation(id);
  }

  @Get('conversations/:id/messages')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  listMessages(@Param('id') id: string, @Query() query: ListWapiMessagesQueryDto) {
    return this.service.listMessages(id, query);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((a: AppAbility) => a.can('send', 'Conversation'))
  sendText(@Param('id') id: string, @Body() dto: SendWapiInboxTextDto) {
    return this.service.sendText(id, dto);
  }

  @Post('conversations/:id/media')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((a: AppAbility) => a.can('send', 'Conversation'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  sendMedia(
    @Param('id') id: string,
    @Body() dto: SendWapiInboxMediaDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Falta el archivo (campo "file" multipart)');
    }
    return this.service.sendMedia(id, dto, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: file.size,
    });
  }

  @Get('messages/:id/media')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  @Header('Cache-Control', 'private, max-age=86400')
  async getMessageMedia(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const meta = await this.service.getMessageMediaMeta(id);
    const opened = await this.mediaService.openLocal(meta.localPath);
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Content-Length', String(opened.size));
    // Inline para imágenes/videos/audio (los renderiza el browser); attachment
    // para documentos (descarga directa).
    const disposition =
      meta.mime.startsWith('image/') ||
      meta.mime.startsWith('audio/') ||
      meta.mime.startsWith('video/')
        ? 'inline'
        : 'attachment';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(meta.filename)}"`,
    );
    return new StreamableFile(opened.stream);
  }

  @Post('conversations/:id/read')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  setRead(@Param('id') id: string, @Body() dto: MarkReadStateDto) {
    return this.service.setReadState(id, dto.read);
  }

  @Post('conversations/:id/take')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  take(@Param('id') id: string) {
    return this.service.take(id);
  }

  @Post('conversations/:id/assign')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  assign(@Param('id') id: string, @Body() dto: AssignWapiConversationDto) {
    return this.service.assignDto(id, dto);
  }

  @Post('conversations/:id/unassign')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  unassign(@Param('id') id: string) {
    return this.service.unassign(id);
  }

  @Post('conversations/:id/resolve')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  resolve(@Param('id') id: string, @Body() dto: ResolveWapiConversationDto) {
    return this.service.resolve(id, dto);
  }

  @Post('conversations/:id/reopen')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  reopen(@Param('id') id: string) {
    return this.service.reopen(id);
  }

  // 4.O.6 — "Poner en espera": ASSIGNED → WAITING con TTL.
  @Post('conversations/:id/hold')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  hold(@Param('id') id: string) {
    return this.service.putOnHold(id);
  }

  @Get('conversations/:id/notes')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  listNotes(@Param('id') id: string) {
    return this.service.listResolutionNotes(id);
  }
}
