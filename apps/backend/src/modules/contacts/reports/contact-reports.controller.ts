import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import type { AppAbility } from '@massivo/permissions';
import { ContactReportsService } from './contact-reports.service';
import {
  GenerateAggregatedReportDto,
  GenerateContactsActivityReportDto,
  GenerateContactsListReportDto,
} from './contact-reports.dto';
import type { GeneratedContactReport } from './contact-reports.types';

/**
 * 5.E — Reportes consolidados de contacts. Sync (single Buffer) — caps por kind
 * para acotar memoria. Async + S3 va a Fase 8 (scheduler genérico de reportes).
 *
 * Permisos: requiere `read` sobre `Contact` — todos los TeamRole excepto VIEWER
 * limitado por la ability factory (VIEWER tiene read pero no update/delete).
 */
@Controller('contacts/reports')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class ContactReportsController {
  constructor(private readonly service: ContactReportsService) {}

  @Post('list')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((a: AppAbility) => a.can('read', 'Contact'))
  async list(
    @Body() dto: GenerateContactsListReportDto,
    @Res() res: Response,
  ): Promise<void> {
    const report = await this.service.generateList(dto);
    sendReport(res, report);
  }

  @Post('activity/:contactId')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((a: AppAbility) => a.can('read', 'Contact'))
  async activity(
    @Param('contactId') contactId: string,
    @Body() dto: GenerateContactsActivityReportDto,
    @Res() res: Response,
  ): Promise<void> {
    const report = await this.service.generateActivity(contactId, dto);
    sendReport(res, report);
  }

  @Post('aggregated')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((a: AppAbility) => a.can('read', 'Contact'))
  async aggregated(
    @Body() dto: GenerateAggregatedReportDto,
    @Res() res: Response,
  ): Promise<void> {
    const report = await this.service.generateAggregated(dto);
    sendReport(res, report);
  }
}

function sendReport(res: Response, report: GeneratedContactReport): void {
  res.setHeader('Content-Type', report.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  res.setHeader('Content-Length', report.buffer.length.toString());
  res.end(report.buffer);
}
