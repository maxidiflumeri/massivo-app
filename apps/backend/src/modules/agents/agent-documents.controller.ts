import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AppAbility } from '@massivo/permissions';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../common/auth/policies.guard';
import { CheckPolicies } from '../../common/auth/check-policies.decorator';
import { Audit } from '../../common/audit/audit.decorator';
import { AgentDocumentService } from './rag/agent-document.service';
import { CreateAgentDocumentDto } from './agents.dto';

/** Tope de tamaño de archivo subido a la base de conocimiento (10MB). */
const DOC_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Base de conocimiento (RAG) de un Agente: subir texto o archivos que se vectorizan.
 * Reusa los permisos CASL de `WapiConfig` (read/update), igual que el resto de Agentes.
 */
@Controller('agents/:id/documents')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class AgentDocumentsController {
  constructor(private readonly docs: AgentDocumentService) {}

  @Get()
  @CheckPolicies((a: AppAbility) => a.can('read', 'WapiConfig'))
  list(@Param('id') id: string) {
    return this.docs.list(id);
  }

  @Post('text')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((a: AppAbility) => a.can('update', 'WapiConfig'))
  @Audit({ action: 'agent.document.added', resourceType: 'AgentDocument', resourceIdFrom: 'param:id' })
  addText(@Param('id') id: string, @Body() dto: CreateAgentDocumentDto) {
    return this.docs.addText(id, dto.name, dto.text);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((a: AppAbility) => a.can('update', 'WapiConfig'))
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DOC_MAX_BYTES } }))
  @Audit({ action: 'agent.document.uploaded', resourceType: 'AgentDocument', resourceIdFrom: 'param:id' })
  upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.docs.addFile(id, file);
  }

  @Delete(':docId')
  @CheckPolicies((a: AppAbility) => a.can('update', 'WapiConfig'))
  @Audit({ action: 'agent.document.removed', resourceType: 'AgentDocument', resourceIdFrom: 'param:docId' })
  remove(@Param('id') id: string, @Param('docId') docId: string) {
    return this.docs.remove(id, docId);
  }
}
