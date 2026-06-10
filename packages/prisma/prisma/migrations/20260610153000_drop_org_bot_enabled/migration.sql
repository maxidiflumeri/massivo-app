-- El override per-org de bots (Organization.botEnabled, previo al gating por
-- planes) queda obsoleto: Plan.features.bot + Plan.limits.bots son la única
-- fuente de verdad. Ver bot-feature.service.ts.
ALTER TABLE "Organization" DROP COLUMN "botEnabled";
