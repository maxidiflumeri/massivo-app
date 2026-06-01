import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface PlanDto {
  code: string;
  name: string;
  priceMonthlyUsd: number;
  features: Record<string, unknown>;
  limits: Record<string, unknown>;
}

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(): Promise<PlanDto[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isPublic: true },
      orderBy: { priceMonthlyUsd: 'asc' },
    });
    return plans.map((p) => ({
      code: p.code,
      name: p.name,
      priceMonthlyUsd: Number(p.priceMonthlyUsd),
      features: (p.features ?? {}) as Record<string, unknown>,
      limits: (p.limits ?? {}) as Record<string, unknown>,
    }));
  }
}
