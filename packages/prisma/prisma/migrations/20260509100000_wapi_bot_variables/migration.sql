-- 4.O.4 — Variables declarativas del bot.
-- botVariables: array publicado de {name,type,description?,defaultValue?}.
-- botVariablesDraft: versión en edición — se copia a botVariables al publicar.
-- El motor usa botVariables para sembrar session.data antes del seedData del router.
ALTER TABLE "WapiConfig"
  ADD COLUMN "botVariables"      JSONB,
  ADD COLUMN "botVariablesDraft" JSONB;
