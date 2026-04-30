import { Module } from '@nestjs/common';
import { WapiConfigsController } from './wapi-configs.controller';
import { WapiConfigsService } from './wapi-configs.service';
import { WapiTemplatesController } from './wapi-templates.controller';
import { WapiTemplatesService } from './wapi-templates.service';

@Module({
  controllers: [WapiConfigsController, WapiTemplatesController],
  providers: [WapiConfigsService, WapiTemplatesService],
})
export class WapiModule {}
