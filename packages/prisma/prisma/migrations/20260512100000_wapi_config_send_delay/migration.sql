-- 4.Q: throttle configurable por línea. Defaults 30s/60s (mismos que WAPI_DELAY_MIN_MS/MAX env).
-- Override per-campaña vive en WapiCampaign.config (JSON), no requiere columna nueva.

ALTER TABLE "WapiConfig" ADD COLUMN "sendDelayMinMs" INTEGER NOT NULL DEFAULT 30000;
ALTER TABLE "WapiConfig" ADD COLUMN "sendDelayMaxMs" INTEGER NOT NULL DEFAULT 60000;
