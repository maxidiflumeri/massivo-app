import { Controller, Get, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { PlansService } from './plans.service';

/**
 * Lista los planes públicos disponibles. Cualquier usuario autenticado puede
 * verlos — los usa el selector de plan en `OrganizationProfile`.
 */
@Controller('plans')
@UseGuards(ClerkAuthGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  list() {
    return this.plansService.listPublic();
  }
}
