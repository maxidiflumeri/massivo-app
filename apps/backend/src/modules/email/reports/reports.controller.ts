import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
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
import { ReportGeneratorService } from './report-generator.service';
import { GenerateReportDto } from './reports.dto';

@Controller('email/reports')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class ReportsController {
  constructor(private readonly generator: ReportGeneratorService) {}

  /**
   * Genera el reporte y lo devuelve como attachment binario. Sync (single
   * Buffer) — suficiente hasta ~50k filas. Async + S3 va a Fase 8.
   *
   * Permisos: requiere read Campaign y read EmailSuppression. Ambas las
   * tiene cualquier TeamRole (MEMBER+ADMIN), pero pedirlas explícito hace
   * que un eventual rol más restringido (read-only-campaigns) no pueda
   * exportar suppressions.
   */
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies(
    (a: AppAbility) => a.can('read', 'Campaign'),
    (a: AppAbility) => a.can('read', 'EmailSuppression'),
  )
  async generate(@Body() dto: GenerateReportDto, @Res() res: Response): Promise<void> {
    const report = await this.generator.generate(dto.kind, dto.format, {
      campaignId: dto.campaignId,
      status: dto.status,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
    });
    res.setHeader('Content-Type', report.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.filename}"`,
    );
    res.setHeader('Content-Length', report.buffer.length.toString());
    res.end(report.buffer);
  }
}
