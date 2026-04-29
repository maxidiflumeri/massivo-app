import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@massivo/prisma';
import { tenantExtension } from './tenant-extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * Cliente con la extension tenant-scope aplicada. Usar siempre desde codigo
   * de dominio que opere sobre modelos tenant-aware. El cliente raiz (this)
   * solo se usa para flujos sin tenant: TenantContextGuard, webhooks Clerk,
   * onboarding, jobs cross-tenant.
   */
  public readonly scoped: PrismaClient;

  constructor() {
    super({ errorFormat: 'pretty' });
    this.scoped = this.$extends(tenantExtension) as unknown as PrismaClient;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
