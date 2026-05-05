import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { AppAbility } from '@massivo/permissions';
import { ClerkAuthGuard } from '../../../common/auth/clerk-auth.guard';
import { TenantContextGuard } from '../../../common/auth/tenant-context.guard';
import { TenantContextInterceptor } from '../../../common/auth/tenant-context.interceptor';
import { PoliciesGuard } from '../../../common/auth/policies.guard';
import { CheckPolicies } from '../../../common/auth/check-policies.decorator';
import { WapiInboxService } from './wapi-inbox.service';
import {
  AssignWapiConversationDto,
  ListWapiConversationsQueryDto,
  ListWapiMessagesQueryDto,
  MarkReadStateDto,
  ResolveWapiConversationDto,
  SendWapiInboxTextDto,
} from './wapi-inbox.dto';

@Controller('wapi/inbox')
@UseGuards(ClerkAuthGuard, TenantContextGuard, PoliciesGuard)
@UseInterceptors(TenantContextInterceptor)
export class WapiInboxController {
  constructor(private readonly service: WapiInboxService) {}

  @Get('conversations')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  list(@Query() query: ListWapiConversationsQueryDto) {
    return this.service.listConversations(query);
  }

  @Get('conversations/:id')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  getOne(@Param('id') id: string) {
    return this.service.getConversation(id);
  }

  @Get('conversations/:id/messages')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  listMessages(@Param('id') id: string, @Query() query: ListWapiMessagesQueryDto) {
    return this.service.listMessages(id, query);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((a: AppAbility) => a.can('send', 'Conversation'))
  sendText(@Param('id') id: string, @Body() dto: SendWapiInboxTextDto) {
    return this.service.sendText(id, dto);
  }

  @Post('conversations/:id/read')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  setRead(@Param('id') id: string, @Body() dto: MarkReadStateDto) {
    return this.service.setReadState(id, dto.read);
  }

  @Post('conversations/:id/take')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  take(@Param('id') id: string) {
    return this.service.take(id);
  }

  @Post('conversations/:id/assign')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  assign(@Param('id') id: string, @Body() dto: AssignWapiConversationDto) {
    return this.service.assignDto(id, dto);
  }

  @Post('conversations/:id/unassign')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  unassign(@Param('id') id: string) {
    return this.service.unassign(id);
  }

  @Post('conversations/:id/resolve')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  resolve(@Param('id') id: string, @Body() dto: ResolveWapiConversationDto) {
    return this.service.resolve(id, dto);
  }

  @Post('conversations/:id/reopen')
  @CheckPolicies((a: AppAbility) => a.can('update', 'Conversation'))
  reopen(@Param('id') id: string) {
    return this.service.reopen(id);
  }

  @Get('conversations/:id/notes')
  @CheckPolicies((a: AppAbility) => a.can('read', 'Conversation'))
  listNotes(@Param('id') id: string) {
    return this.service.listResolutionNotes(id);
  }
}
