-- 4.N.2: WapiBotSession.data (jsonb) para variables capturadas por nodos CAPTURE.
-- Llaves = saveAs de cada captura; valores = string|number|bool. Se usa para
-- interpolación {{var}} en MESSAGE/CAPTURE/MEDIA y para ramas CONDITION{kind:'var'}.
ALTER TABLE "WapiBotSession" ADD COLUMN "data" JSONB DEFAULT '{}'::jsonb;
