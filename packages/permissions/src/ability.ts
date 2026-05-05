import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
  type MongoQuery,
} from '@casl/ability';
import type { OrgRole, TeamRole } from '@massivo/shared-types';
import type { Action, Subject } from './subjects';
import type { PlanFeatures } from './plan-features';

export type AppAbility = MongoAbility<[Action, Subject]>;

export interface AbilityContext {
  organizationId: string;
  teamId: string;
  orgRole: OrgRole;
  teamRole: TeamRole;
  planFeatures: PlanFeatures;
}

type Conditions = MongoQuery<Record<string, unknown>>;
type Can = (action: Action | Action[], subject: Subject | Subject[], conditions?: Conditions) => void;
type Cannot = (action: Action | Action[], subject: Subject | Subject[], conditions?: Conditions) => { because: (reason: string) => void };

export function defineAbilityFor(ctx: AbilityContext): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  const can = builder.can as unknown as Can;
  const cannot = builder.cannot as unknown as Cannot;
  const { organizationId, teamId, orgRole, teamRole, planFeatures } = ctx;

  if (orgRole === 'OWNER' || orgRole === 'ADMIN') {
    can('manage', 'Organization', { id: organizationId });
    can('manage', 'Team', { organizationId });
    can('manage', 'Member', { organizationId });
  }

  if (orgRole === 'OWNER' || orgRole === 'BILLING') {
    can('manage', 'Billing', { organizationId });
  }

  if (teamRole === 'ADMIN') {
    can('manage', 'all', { teamId });
  }

  if (teamRole === 'MEMBER') {
    can(['create', 'read', 'update', 'send'], ['Campaign', 'Template', 'Contact', 'ContactList', 'Tag', 'WapiTemplate'], { teamId });
    can('delete', ['Contact', 'ContactList', 'Tag'], { teamId });
    can('read', ['WapiConfig', 'SmtpAccount', 'Analytics', 'EmailSuppression'], { teamId });
    can(['read', 'update', 'send'], 'Conversation', { teamId });
    can(['create', 'read', 'update', 'delete'], 'QuickReply', { teamId });
  }

  if (teamRole === 'VIEWER') {
    can('read', 'all', { teamId });
  }

  if (planFeatures.ai !== true) {
    cannot('use', 'AiFeature').because('Plan no incluye AI');
  }
  if (planFeatures.multiTeam !== true) {
    cannot('create', 'Team').because('Plan no incluye multi-team');
  }

  return builder.build();
}
