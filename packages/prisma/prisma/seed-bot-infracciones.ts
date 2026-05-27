/**
 * Seed POC — bot de consulta de multas/infracciones de Provincia de Buenos Aires.
 *
 * Crea (o actualiza) una WapiConfig de test sobre la org dev (la misma que setea
 * `dev-seed.ts`) y le carga un flow que:
 *  1. Pide DNI (CAPTURE con preset number).
 *  2. Pide sexo (MENU M/F).
 *  3. Llama a la API real de infraccionesba.gba.gob.ar con DNI/sexo + reCaptcha
 *     token + JSESSIONID cookie (ambos leídos del .env).
 *  4. Ramifica: error de transporte / api.body.error true / totalInfracciones 0
 *     / N multas.
 *  5. Para N multas: FOREACH itera el array, manda un mensaje formateado por
 *     cada una.
 *  6. Después ofrece ver detalle o cupón de pago de una multa puntual
 *     (CAPTURE pide el número de orden y SET_VAR resuelve el nroCausa con
 *     JSONata). Manda los links de la API que devuelven imagen (el usuario los
 *     abre en el browser).
 *
 * El reCaptcha token y JSESSIONID se siembran como `defaultValue` de las
 * BotVariables `reCaptchaToken` y `jsessionid`. Cuando se queman (típico:
 * captcha expira), se editan desde el editor visual del bot (panel "variables")
 * y se publica — el motor toma los nuevos valores sin redeploy ni re-seed.
 *
 * Los env vars son OPCIONALES: si no los seteás, el seed crea las variables
 * con defaultValue vacío y vos los completás desde el UI.
 *
 * Uso:
 *   1. (Opcional) En .env: setear INFRACCIONES_RECAPTCHA_TOKEN y INFRACCIONES_JSESSIONID.
 *   2. pnpm --filter @massivo/prisma seed:bot-infracciones
 *
 * La WapiConfig se crea con isTestMode=true → los mensajes salen como SIM_,
 * podés probarla en /dashboard/dev/wapi/chat sin tocar Meta.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (definila en .env)`);
  return v;
}

/**
 * `DEV_INFRACCIONES_SIM` crea una WapiConfig "POC" (isTestMode=true, tokens fake)
 * para probar en /dashboard/dev/wapi/chat sin tocar Meta. Si seteás
 * `BOT_INFRACCIONES_PHONE_ID=<phoneNumberId>` en .env, el seed ATTACHEA el flow
 * a una WapiConfig ya existente (típicamente la real con WhatsApp validado),
 * preservando todos los tokens / isTestMode / appSecret — solo setea botTopics,
 * botRouter, botEnabled y (si están vacías) botVariables.
 */
const PHONE_NUMBER_ID = process.env.BOT_INFRACCIONES_PHONE_ID ?? 'DEV_INFRACCIONES_SIM';
const URL_CONSULTAR =
  'https://infraccionesba.gba.gob.ar/rest/consultar-infraccion' +
  '?tipoDocumento=0&nroDocumento={{dni}}&genero={{genero}}' +
  '&reCaptcha={{reCaptchaToken}}&cantPorPagina=100&paginaActual=1';

const flow = {
  startNodeId: 'welcome',
  nodes: {
    welcome: {
      kind: 'MESSAGE',
      text: '👋 Hola! Te ayudo a consultar tus multas de Provincia de Buenos Aires.',
      nextNodeId: 'ask_dni',
    },
    ask_dni: {
      kind: 'CAPTURE',
      text: '🆔 Decime tu DNI (solo números, sin puntos):',
      saveAs: 'dni',
      validate: { kind: 'preset', preset: 'number' },
      nextNodeId: 'ask_sexo',
      retryNodeId: 'err_dni',
    },
    err_dni: {
      kind: 'MESSAGE',
      text: '❌ Formato inválido. Tiene que ser solo números.',
      nextNodeId: 'ask_dni',
    },
    ask_sexo: {
      kind: 'MENU',
      text: '👤 ¿Cuál es tu sexo?',
      options: [
        { id: 'M', label: '👨 Masculino', nextNodeId: 'set_m' },
        { id: 'F', label: '👩 Femenino', nextNodeId: 'set_f' },
      ],
    },
    set_m: { kind: 'SET_VAR', varName: 'genero', value: 'M', nextNodeId: 'http_consulta' },
    set_f: { kind: 'SET_VAR', varName: 'genero', value: 'F', nextNodeId: 'http_consulta' },
    http_consulta: {
      kind: 'HTTP',
      method: 'GET',
      url: URL_CONSULTAR,
      headers: {
        // jsessionid se guarda con el prefijo incluido (ej `JSESSIONID=37AB...`)
        // para poder copiar la cookie tal cual del DevTools del navegador.
        Cookie: '{{jsessionid}}',
        Accept: 'application/json',
      },
      timeoutMs: 10000,
      saveAs: 'infraccionesResp',
      nextNodeId: 'set_api_error',
      errorNodeId: 'msg_http_error',
    },
    msg_http_error: {
      kind: 'MESSAGE',
      text: '⚠️ Hubo un problema consultando al servidor (timeout o red). Probá más tarde.',
      nextNodeId: 'goodbye',
    },
    set_api_error: {
      kind: 'SET_VAR',
      varName: 'apiError',
      value: '{{= infraccionesResp.body.error }}',
      nextNodeId: 'cond_api',
    },
    cond_api: {
      kind: 'CONDITION',
      branches: [
        {
          id: 'api-error',
          when: { kind: 'var', var: 'apiError', op: 'eq', value: 'true' },
          nextNodeId: 'msg_api_error',
        },
      ],
      elseNextNodeId: 'set_total',
    },
    msg_api_error: {
      kind: 'MESSAGE',
      text:
        '⚠️ La consulta no se pudo procesar. Posiblemente el captcha/JSESSIONID expiró.\n\n' +
        '*Debug:*\n' +
        'Status: {{= infraccionesResp.status }}\n' +
        'Body: ```{{= $string(infraccionesResp.body) }}```\n\n' +
        'Refrescá las variables `reCaptchaToken` y `jsessionid` desde el panel de variables.',
      nextNodeId: 'goodbye',
    },
    set_total: {
      kind: 'SET_VAR',
      varName: 'totalInfracciones',
      value: '{{= infraccionesResp.body.totalInfracciones }}',
      nextNodeId: 'cond_total',
    },
    cond_total: {
      kind: 'CONDITION',
      branches: [
        {
          id: 'sin-multas',
          when: { kind: 'var', var: 'totalInfracciones', op: 'eq', value: '0' },
          nextNodeId: 'msg_sin_multas',
        },
      ],
      elseNextNodeId: 'msg_total',
    },
    msg_sin_multas: {
      kind: 'MESSAGE',
      text: '🎉 ¡Buenas noticias! No tenés multas registradas.',
      nextNodeId: 'goodbye',
    },
    msg_total: {
      kind: 'MESSAGE',
      text: '📋 Tenés *{{totalInfracciones}}* multa(s). Te las listo a continuación:',
      nextNodeId: 'foreach_multas',
    },
    foreach_multas: {
      kind: 'FOREACH',
      items: 'infraccionesResp.body.infracciones',
      itemVar: 'multa',
      indexVar: 'idx',
      bodyNodeId: 'show_multa',
      doneNodeId: 'ask_action',
    },
    show_multa: {
      kind: 'MESSAGE',
      text:
        '🚗 *Multa #{{= idx + 1 }}* — Patente *{{= multa.dominio }}*\n' +
        'Acta: `{{= multa.nroActa }}`\n' +
        'Causa: `{{= multa.nroCausa }}`\n' +
        '💵 Importe: ${{= multa.importeTotal }}\n' +
        '📅 Vencimiento: {{= $fromMillis(multa.fechaVencimiento, "[D01]/[M01]/[Y0001]") }}\n' +
        '🔖 Estado: {{= multa.estadoCausaPublico.descripcion }}\n' +
        'Infracción: {{= multa.infracciones[0].descripcion }}',
    },
    ask_action: {
      kind: 'MENU',
      text: '¿Qué querés hacer?',
      options: [
        { id: 'detalle', label: '📄 Ver detalle', nextNodeId: 'ask_orden_detalle' },
        { id: 'cupon', label: '💳 Ver cupón', nextNodeId: 'ask_orden_cupon' },
        { id: 'salir', label: '👋 Salir', nextNodeId: 'goodbye' },
      ],
    },
    ask_orden_detalle: {
      kind: 'CAPTURE',
      text: '🔢 Decime el número de multa (1 a {{totalInfracciones}}) para ver el detalle:',
      saveAs: 'nroOrden',
      validate: { kind: 'preset', preset: 'number' },
      nextNodeId: 'set_causa_detalle',
      retryNodeId: 'err_orden_detalle',
    },
    err_orden_detalle: {
      kind: 'MESSAGE',
      text: '❌ Tiene que ser un número.',
      nextNodeId: 'ask_orden_detalle',
    },
    set_causa_detalle: {
      kind: 'SET_VAR',
      varName: 'nroCausa',
      // Block expression: calculamos el índice como variable JSONata (`$idx`) y
      // referimos al root con `$$` porque dentro de `[]` el contexto cambia al
      // item actual del array (si usáramos `nroOrden` ahí, JSONata lo buscaría
      // dentro de cada infracción y nunca lo encontraría → resultado vacío).
      value:
        '{{= ($idx := $number($$.nroOrden) - 1; $$.infraccionesResp.body.infracciones[$idx].nroCausa) }}',
      nextNodeId: 'send_link_detalle',
    },
    send_link_detalle: {
      kind: 'MEDIA_FROM_URL',
      mediaType: 'document',
      url: 'https://infraccionesba.gba.gob.ar/rest/consultar-detalle-acta?nroCausa={{nroCausa}}',
      filename: 'detalle-{{nroCausa}}.pdf',
      caption: '📄 Detalle de la multa {{nroCausa}}',
      timeoutMs: 20000,
      nextNodeId: 'ask_action_again',
      errorNodeId: 'msg_media_error',
    },
    ask_orden_cupon: {
      kind: 'CAPTURE',
      text: '🔢 Decime el número de multa (1 a {{totalInfracciones}}) para ver el cupón de pago:',
      saveAs: 'nroOrden',
      validate: { kind: 'preset', preset: 'number' },
      nextNodeId: 'set_causa_cupon',
      retryNodeId: 'err_orden_cupon',
    },
    err_orden_cupon: {
      kind: 'MESSAGE',
      text: '❌ Tiene que ser un número.',
      nextNodeId: 'ask_orden_cupon',
    },
    set_causa_cupon: {
      kind: 'SET_VAR',
      varName: 'nroCausa',
      // Block expression: calculamos el índice como variable JSONata (`$idx`) y
      // referimos al root con `$$` porque dentro de `[]` el contexto cambia al
      // item actual del array (si usáramos `nroOrden` ahí, JSONata lo buscaría
      // dentro de cada infracción y nunca lo encontraría → resultado vacío).
      value:
        '{{= ($idx := $number($$.nroOrden) - 1; $$.infraccionesResp.body.infracciones[$idx].nroCausa) }}',
      nextNodeId: 'send_link_cupon',
    },
    send_link_cupon: {
      kind: 'MEDIA_FROM_URL',
      mediaType: 'document',
      url: 'https://infraccionesba.gba.gob.ar/rest/generar-cupon?nroCausa={{nroCausa}}',
      filename: 'cupon-{{nroCausa}}.pdf',
      caption: '💳 Cupón de pago — multa {{nroCausa}}',
      timeoutMs: 20000,
      nextNodeId: 'ask_action_again',
      errorNodeId: 'msg_media_error',
    },
    msg_media_error: {
      kind: 'MESSAGE',
      text:
        '⚠️ No se pudo descargar el archivo en este momento.\n' +
        'Probá de nuevo en unos instantes.',
      nextNodeId: 'ask_action_again',
    },
    ask_action_again: {
      kind: 'MENU',
      text: '¿Querés algo más?',
      options: [
        { id: 'detalle', label: '📄 Ver otro detalle', nextNodeId: 'ask_orden_detalle' },
        { id: 'cupon', label: '💳 Ver otro cupón', nextNodeId: 'ask_orden_cupon' },
        { id: 'salir', label: '👋 Salir', nextNodeId: 'goodbye' },
      ],
    },
    goodbye: {
      // MESSAGE sin nextNodeId = terminal silencioso. NO deriva al inbox
      // (eso sería HANDOFF). La sesión queda viva hasta que expire por TTL
      // (botSessionTtlMin, default 30min), o hasta que el cliente mande la
      // keyword `multas` de nuevo (el router la intercepta y arranca fresh).
      kind: 'MESSAGE',
      text: '✅ ¡Listo! Si necesitás otra consulta, escribime "multas" otra vez.',
    },
  },
};

const topics = [
  {
    id: 'multas',
    label: 'Consulta de multas GBA',
    flow,
  },
];

const router = {
  rules: [
    {
      kind: 'keyword',
      keywords: ['multas', 'multa', 'infracciones', 'infraccion'],
      topicId: 'multas',
    },
  ],
  defaultTopicId: 'multas',
};

async function main() {
  const clerkOrgId = requireEnv('DEV_CLERK_ORG_ID');
  const reCaptchaToken = process.env.INFRACCIONES_RECAPTCHA_TOKEN ?? '';
  const jsessionid = process.env.INFRACCIONES_JSESSIONID ?? '';

  const org = await prisma.organization.findUnique({ where: { clerkOrgId } });
  if (!org) {
    throw new Error(
      `Organization con clerkOrgId="${clerkOrgId}" no existe. Corré antes: pnpm --filter @massivo/prisma exec ts-node prisma/dev-seed.ts`,
    );
  }

  const team = await prisma.team.findFirst({
    where: { organizationId: org.id, isDefault: true },
  });
  if (!team) {
    throw new Error(`Team default de la org "${org.id}" no existe. Corré dev-seed primero.`);
  }

  const variables = [
    { name: 'dni', type: 'string', description: 'DNI ingresado por el usuario' },
    { name: 'genero', type: 'string', description: 'M o F' },
    {
      name: 'reCaptchaToken',
      type: 'string',
      description: 'Token reCaptcha — editar desde panel de variables cuando se queme',
      ...(reCaptchaToken ? { defaultValue: reCaptchaToken } : {}),
    },
    {
      name: 'jsessionid',
      type: 'string',
      description: 'JSESSIONID cookie — editar desde panel de variables cuando expire',
      ...(jsessionid ? { defaultValue: jsessionid } : {}),
    },
    { name: 'apiError', type: 'boolean', description: 'body.error de la API' },
    { name: 'totalInfracciones', type: 'number', description: 'body.totalInfracciones' },
    { name: 'nroOrden', type: 'string', description: 'Número de multa elegido' },
    { name: 'nroCausa', type: 'string', description: 'nroCausa derivado del item' },
  ];

  const now = new Date();

  const existing = await prisma.wapiConfig.findUnique({
    where: { teamId_phoneNumberId: { teamId: team.id, phoneNumberId: PHONE_NUMBER_ID } },
    select: { id: true, name: true, isTestMode: true, botVariables: true },
  });

  let config;
  if (existing) {
    // Attach mode: la config ya existe (sea POC seed o WhatsApp real).
    // Preservamos isTestMode, accessToken, appSecret, etc. — solo refrescamos
    // topics/router/botEnabled. Las botVariables se setean SOLO si están vacías
    // (primera attach); si ya están, las conservamos para no perder tokens
    // editados desde el panel de variables.
    const variablesAlreadySet =
      Array.isArray(existing.botVariables) && (existing.botVariables as unknown[]).length > 0;
    config = await prisma.wapiConfig.update({
      where: { id: existing.id },
      data: {
        botEnabled: true,
        botTopics: topics as never,
        botRouter: router as never,
        botTopicsDraft: topics as never,
        botRouterDraft: router as never,
        botPublishedAt: now,
        botDraftUpdatedAt: now,
        ...(variablesAlreadySet
          ? {}
          : {
              botVariables: variables as never,
              botVariablesDraft: variables as never,
            }),
      },
    });
    console.log(
      `\nBot attacheado a WapiConfig existente "${existing.name}" (isTestMode=${existing.isTestMode}).`,
    );
    console.log(
      variablesAlreadySet
        ? '  Variables existentes preservadas (editalas desde el panel de variables).'
        : '  Variables sembradas (primera attach).',
    );
  } else {
    // Create mode: no existe. Solo permitimos crear con el slot de POC
    // (DEV_INFRACCIONES_SIM) — para no crear configs reales accidentalmente.
    if (PHONE_NUMBER_ID !== 'DEV_INFRACCIONES_SIM') {
      throw new Error(
        `WapiConfig con phoneNumberId="${PHONE_NUMBER_ID}" no existe.\n` +
          `Para crearla, primero hacelo via el UI normal de WapiConfigs.\n` +
          `El seed solo crea automáticamente la config POC con DEV_INFRACCIONES_SIM.`,
      );
    }
    config = await prisma.wapiConfig.create({
      data: {
        organizationId: org.id,
        teamId: team.id,
        name: 'Bot Multas GBA (POC)',
        phoneNumberId: PHONE_NUMBER_ID,
        businessAccountId: 'DEV_BA',
        accessTokenEnc: 'DEV_TOKEN',
        webhookVerifyTokenEnc: 'DEV_VERIFY',
        isTestMode: true,
        botEnabled: true,
        botTopics: topics as never,
        botRouter: router as never,
        botVariables: variables as never,
        botTopicsDraft: topics as never,
        botRouterDraft: router as never,
        botVariablesDraft: variables as never,
        botPublishedAt: now,
        botDraftUpdatedAt: now,
      },
    });
    console.log('\nWapiConfig POC creada (isTestMode=true, tokens fake).');
  }

  console.log('\nBot Multas GBA seed OK');
  console.log(`  wapiConfig.id   = ${config.id}`);
  console.log(`  phoneNumberId   = ${PHONE_NUMBER_ID}`);
  console.log(`  organization.id = ${org.id}`);
  console.log(`  team.id         = ${team.id}`);
  console.log('\nPara probarlo:');
  console.log(`  1. Abrí /dashboard/dev/wapi/chat (config "${config.name}").`);
  console.log(`  2. Mandá "multas" como inbound — arranca el bot.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
