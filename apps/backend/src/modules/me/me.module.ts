import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
  controllers: [MeController, UsageController],
  providers: [MeService, UsageService],
})
export class MeModule {}
