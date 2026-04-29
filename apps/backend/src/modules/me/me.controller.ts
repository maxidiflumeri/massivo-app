import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ClerkAuthGuard } from '../../common/auth/clerk-auth.guard';
import { MeService } from './me.service';
import { MeContextResponse } from '@massivo/shared-types';

@Controller('me')
@UseGuards(ClerkAuthGuard)
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get('context')
  async getContext(@Req() req: Request & { clerkUserId: string }): Promise<MeContextResponse> {
    return this.meService.getContext(req.clerkUserId);
  }
}
