import { Module } from '@nestjs/common';
import { WapiModule } from '../wapi/wapi.module';
import {
  DevSimulatorController,
  DevSimulatorEnabledGuard,
} from './dev-simulator.controller';
import { DevSimulatorService } from './dev-simulator.service';

/**
 * Módulo de utilidades de desarrollo (4.L). Sólo expone endpoints si
 * `ENABLE_DEV_SIMULATOR=true` (ver `DevSimulatorEnabledGuard`). El módulo se
 * registra siempre, así no hay branching en `app.module.ts`; el gate vive en
 * el guard.
 */
@Module({
  imports: [WapiModule],
  controllers: [DevSimulatorController],
  providers: [DevSimulatorService, DevSimulatorEnabledGuard],
})
export class DevModule {}
