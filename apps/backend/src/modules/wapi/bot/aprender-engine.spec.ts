/**
 * ============================================================================
 *  TEST DE APRENDIZAJE — seguí el engine del bot paso a paso
 * ============================================================================
 *
 * Este NO es un test de verdad (aunque tiene un par de expects para que pase).
 * Es una herramienta para ENTENDER el motor: corre una conversación completa,
 * turno por turno, e imprime por consola EXACTAMENTE por dónde va pasando.
 *
 * Cómo correrlo (desde la raíz del repo o desde apps/backend):
 *   cd apps/backend
 *   npx jest aprender-engine --silent=false
 *
 * (el `--silent=false` es importante: hace que jest muestre los console.log)
 *
 * Cómo DEBUGGEARLO con breakpoints en VSCode:
 *   1. Abrí wapi-bot-engine.service.ts y poné un breakpoint en handle() (L110)
 *      y otro en runChain() (en el for, ~L349) y otro en deliverNode() (~L760).
 *   2. Usá la config "Debug: aprender-engine" del launch.json (la creamos junto
 *      con este archivo) o el botón "Debug" que el plugin de Jest pone arriba
 *      del `it(...)`.
 *   3. F5 → F10 (step over) / F11 (step into). Mirá cómo cambian `data`,
 *      `currentId`, `topicId` en el panel de variables.
 *
 * ----------------------------------------------------------------------------
 * EL FLOW QUE SIMULAMOS (lo más parecido a un "waterfall dialog" de Bot Framework):
 *
 *   ask (CAPTURE) ── pregunta el nombre, lo guarda en data.nombre
 *      │ nextNodeId
 *      ▼
 *   saludo (MESSAGE) ── "¡Hola {{nombre}}!"   (interpolación)
 *      │ nextNodeId        (esto encadena solo, sin esperar al usuario)
 *      ▼
 *   menu (MENU) ── "¿Qué querés hacer?"  [Info] [Hablar con humano]
 *      ├─ opción info   → darInfo
 *      └─ opción humano → fin
 *
 *   darInfo (MESSAGE) ── texto terminal
 *   fin (HANDOFF)     ── deriva a humano + escalate
 * ----------------------------------------------------------------------------
 */
import { TenantContext } from '../../../common/auth/tenant-context';
import { WhatsAppAdapter } from '../../channels/adapters/whatsapp.adapter';
import { WapiBotEngineService } from './wapi-bot-engine.service';
import type { BotFlow } from './wapi-bot.types';

const flow: BotFlow = {
  startNodeId: 'ask',
  nodes: {
    ask: {
      kind: 'CAPTURE',
      text: '¡Hola! ¿Cómo te llamás?',
      saveAs: 'nombre',
      nextNodeId: 'saludo',
    },
    saludo: {
      kind: 'MESSAGE',
      text: '¡Encantado, {{nombre}}! 👋',
      nextNodeId: 'menu',
    },
    menu: {
      kind: 'MENU',
      text: '{{nombre}}, ¿qué querés hacer?',
      options: [
        { id: 'info', label: 'Ver info', nextNodeId: 'darInfo' },
        { id: 'humano', label: 'Hablar con humano', nextNodeId: 'fin' },
      ],
    },
    darInfo: { kind: 'MESSAGE', text: 'Somos Massivo, una plataforma de mensajería.' },
    fin: { kind: 'HANDOFF', text: 'Listo {{nombre}}, te derivo con una persona.', escalate: true },
  },
};

const cfg = {
  id: 'cfg-1',
  phoneNumberId: 'pn-1',
  accessTokenEnc: 'enc-token',
  isTestMode: true,
  botEnabled: true,
  botFlow: flow,
  botSessionTtlMin: 30,
};

const PHONE = '5491100000';
const SESSION_KEY = `${cfg.id}|${PHONE}`;

// ---------------------------------------------------------------------------
//  "Base de datos" de sesiones en memoria (un Map). Esto reemplaza a la tabla
//  WapiBotSession. Lo importante: PERSISTE entre los 4 turnos, igual que la DB
//  real. Así ves cómo el motor lee el estado al empezar cada turno y lo vuelve
//  a guardar al final.
// ---------------------------------------------------------------------------
type Row = {
  id: string;
  configId: string;
  phone: string;
  currentNodeId: string;
  currentTopicId: string | null;
  data: unknown;
  expiresAt: Date;
  endedAt: Date | null;
  endedReason: string | null;
  startedAt: Date;
  lastInboundAt: Date;
};
const sessionStore = new Map<string, Row>();
let idSeq = 1;

function makeSessionMock() {
  return {
    // findActiveSession() llama acá al empezar cada turno.
    findFirst: async ({ where }: any): Promise<Row | null> => {
      const key = `${where.configId}|${where.phone}`;
      const row = sessionStore.get(key);
      if (!row || row.endedAt !== null) return null;
      return row;
    },
    // upsertSession() llama acá al final del turno (guarda dónde quedó).
    upsert: async ({ where, update, create }: any) => {
      const { configId, phone } = where.channelId_externalUserId;
      const key = `${configId}|${phone}`;
      const existing = sessionStore.get(key);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      // En la DB real estas columnas default a NULL; el `create` del engine no
      // las manda, así que las ponemos en null acá (si no, findFirst descarta
      // la fila porque `undefined !== null`).
      const row: Row = { id: `sess-${idSeq++}`, configId, phone, endedAt: null, endedReason: null, ...create };
      sessionStore.set(key, row);
      return row;
    },
    // persistSessionData() y endSession() llaman acá (update by id).
    update: async ({ where, data }: any) => {
      for (const row of sessionStore.values()) {
        if (row.id === where.id) {
          Object.assign(row, data);
          return row;
        }
      }
      return undefined;
    },
    create: async () => ({ id: `sess-${idSeq++}` }),
    findMany: async () => [],
  };
}

describe('🤖 Engine del bot — recorrido paso a paso', () => {
  let svc: WapiBotEngineService;

  beforeEach(() => {
    sessionStore.clear();
    idSeq = 1;

    const prismaScoped = {
      botSession: makeSessionMock(),
      message: {
        create: async ({ data }: any) => ({ id: 'msg-x', content: data.content }),
      },
      conversation: {
        // guard de botSuspended + lectura de status en HANDOFF
        findUnique: async () => ({
          botSuspended: false,
          status: 'UNASSIGNED',
          assignedUserId: null,
          lastAssignedUserId: null,
        }),
        update: async () => undefined,
      },
    };

    // El sender es la "última milla" hacia Meta. Acá sólo imprime lo que se
    // mandaría al cliente y devuelve un id falso.
    const sender = {
      sendText: async (_cfg: any, input: any) => {
        console.log(`      📤 sender.sendText → "${input.body}"`);
        return { metaMessageId: 'wamid.OUT', raw: {} };
      },
      sendInteractiveButtons: async (_cfg: any, input: any) => {
        const btns = input.buttons.map((b: any) => `[${b.title}]`).join(' ');
        console.log(`      📤 sender.sendInteractiveButtons → "${input.body}"  ${btns}`);
        return { metaMessageId: 'wamid.OUT', raw: {} };
      },
      sendMediaById: async (_cfg: any, input: any) => {
        console.log(`      📤 sender.sendMediaById → ${input.type} (${input.mediaId})`);
        return { metaMessageId: 'wamid.OUT', raw: {} };
      },
    };

    // El engine envía a través del WhatsAppAdapter REAL (la capa de canal),
    // que traduce el OutboundMessage normalizado a la llamada del sender.
    const adapter = new WhatsAppAdapter(sender as never);

    const events = { emitToTeam: () => undefined, emitToTeamDebounced: () => undefined };
    const encryption = { decrypt: (v: string) => `dec(${v})` };
    const feature = { isEnabled: async () => true };
    const router = { resolve: () => null }; // flow legacy: sin router, cae al topic 'default'
    const httpExecutor = { execute: async () => ({ ok: true, status: 200, body: null, durationMs: 0 }) };
    const mediaFetch = { execute: async () => ({ ok: false, error: 'n/a', durationMs: 0 }) };

    // 🔎 EventLogger instrumentado: el engine ya llama a estos métodos en cada
    // paso (botNodeEntered, botCapture, botSessionStarted...). Acá los hacemos
    // imprimir → ESTE es el "trace" del camino por los nodos.
    const tracingEventLogger = new Proxy(
      {},
      {
        get: (_t, prop: string) => (...args: unknown[]) => {
          if (prop === 'botNodeEntered') {
            const a = args[0] as any;
            console.log(`   🔎 entra al nodo "${a.nodeId}" (${a.nodeKind}) [topic=${a.topicId}]`);
          } else if (prop === 'botCapture') {
            const a = args[0] as any;
            console.log(`   💾 CAPTURE guardó  ${a.varName} = ${JSON.stringify(a.value)}`);
          } else if (prop === 'botSetVar') {
            const a = args[0] as any;
            console.log(`   💾 SET_VAR  ${a.varName} = ${JSON.stringify(a.value)}`);
          } else if (prop === 'botSessionStarted') {
            console.log(`   🟢 sesión INICIADA`);
          } else if (prop === 'botSessionEnded') {
            const a = args[0] as any;
            console.log(`   🔴 sesión TERMINADA (reason=${a.reason})`);
          } else if (prop === 'botHandoff') {
            console.log(`   🤝 HANDOFF → deriva a humano`);
          }
          // resto de métodos (botHttpCall, botMediaFetch, custom...): silencioso
        },
      },
    );

    svc = new WapiBotEngineService(
      { scoped: prismaScoped } as never,
      events as never,
      adapter as never,
      encryption as never,
      feature as never,
      router as never,
      httpExecutor as never,
      mediaFetch as never,
      tracingEventLogger as never,
    );
  });

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return TenantContext.run(
      { userId: 'u-1', organizationId: 'org-a', teamId: 'team-a', orgRole: 'OWNER', teamRole: 'ADMIN' },
      fn,
    );
  }

  function input(inbound: any) {
    return { configId: cfg.id, conversationId: 'conv-1', phone: PHONE, inbound };
  }

  function banner(t: string) {
    console.log('\n' + '═'.repeat(72));
    console.log('  ' + t);
    console.log('═'.repeat(72));
  }

  function printSessionState() {
    const row = sessionStore.get(SESSION_KEY);
    if (!row) {
      console.log('   📦 sesión en DB: (ninguna — terminada o no creada)');
      return;
    }
    console.log(
      `   📦 sesión en DB → currentNodeId="${row.currentNodeId}"  ` +
        `topic="${row.currentTopicId}"  ended=${row.endedAt ? 'sí' : 'no'}  ` +
        `data=${JSON.stringify(row.data)}`,
    );
  }

  it('una conversación completa: nombre → saludo → menú → handoff', async () => {
    // ─── TURNO 1 ────────────────────────────────────────────────────────────
    banner('TURNO 1 — el cliente escribe "hola" (no hay sesión todavía)');
    console.log('Esperado: como no hay sesión, el router no matchea nada, cae al');
    console.log('topic "default" y arranca en el startNode (ask = CAPTURE), que');
    console.log('manda el prompt y deja la sesión esperando la respuesta.\n');
    let out = await withTenant(() => svc.handle(cfg, input({ kind: 'text', body: 'hola' })));
    console.log(`   ↩️  handle() devolvió: ${JSON.stringify(out)}`);
    printSessionState();
    expect(out.handled).toBe(true);

    // ─── TURNO 2 ────────────────────────────────────────────────────────────
    banner('TURNO 2 — el cliente responde "Maxi" (la sesión está parada en CAPTURE)');
    console.log('Esperado: el nodo actual es CAPTURE → valida y guarda nombre="Maxi",');
    console.log('avanza a "saludo" (MESSAGE), que ENCADENA solo hasta "menu" (MENU)');
    console.log('sin esperar input. Fijate cómo se mandan DOS mensajes en un turno.\n');
    out = await withTenant(() => svc.handle(cfg, input({ kind: 'text', body: 'Maxi' })));
    console.log(`   ↩️  handle() devolvió: ${JSON.stringify(out)}`);
    printSessionState();

    // ─── TURNO 3 ────────────────────────────────────────────────────────────
    banner('TURNO 3 — el cliente escribe texto en vez de tocar un botón del MENU');
    console.log('Esperado: el nodo actual es MENU y esperaba un botón. Al llegar texto,');
    console.log('el motor RE-ENVÍA el mismo menú y NO avanza (no toca la sesión).\n');
    out = await withTenant(() => svc.handle(cfg, input({ kind: 'text', body: 'no sé' })));
    console.log(`   ↩️  handle() devolvió: ${JSON.stringify(out)}`);
    printSessionState();

    // ─── TURNO 4 ────────────────────────────────────────────────────────────
    banner('TURNO 4 — el cliente toca el botón "Hablar con humano" (bot:humano)');
    console.log('Esperado: el botón resuelve la opción → salta a "fin" (HANDOFF):');
    console.log('manda el mensaje final, CIERRA la sesión y devuelve ended+escalate.\n');
    out = await withTenant(() =>
      svc.handle(cfg, input({ kind: 'button', buttonId: 'bot:humano', contextMetaMessageId: null })),
    );
    console.log(`   ↩️  handle() devolvió: ${JSON.stringify(out)}`);
    printSessionState();
    expect(out).toEqual(expect.objectContaining({ handled: true, ended: true, escalate: true }));

    console.log('\n' + '═'.repeat(72));
    console.log('  FIN. Volvé a leer el trace de arriba con el código al lado.');
    console.log('═'.repeat(72) + '\n');
  });
});
