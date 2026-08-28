import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import type { MonitoringReport, ReportTopic } from '../types';
import {
  ACCENT,
  BAD,
  GRID,
  INK,
  INK2,
  MUTED,
  NAVY,
  OK,
  WARN,
  cellBar,
  dailyChart,
  dec,
  endpointCorto,
  hourlyChart,
  nf,
  nodeLabel,
  pct,
  rankingChart,
  stackedBar,
} from './charts';

/** Ancho útil de una A4 vertical con los márgenes de abajo. */
const W = 527;
const MARGINS: [number, number, number, number] = [34, 34, 34, 44];

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** 'YYYY-MM-DD' → '5 de agosto de 2026'. Se ancla al mediodía UTC para que el
 *  día no se corra con la zona horaria del navegador. */
function fechaLarga(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

function fechaCorta(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

function weekday(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

function segundos(s: number): string {
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `${m} min ${r} s` : `${m} min`;
}

/** Encabezado de sección: barrita de acento + banda clara, como los informes
 *  que ya circulan en el Ministerio. */
function seccion(titulo: string, primera = false): Content {
  return {
    table: { widths: [4, '*'], body: [[{ text: '', fillColor: ACCENT }, { text: titulo, style: 'h2', fillColor: '#e8effc' }]] },
    layout: 'noBorders',
    margin: [0, primera ? 4 : 16, 0, 8],
  };
}

function nota(texto: string): Content {
  return { text: texto, style: 'nota', margin: [0, 5, 0, 0] };
}

/** Tarjeta de KPI: número grande + rótulo + una línea de contexto. */
function kpi(valor: string, rotulo: string, detalle: string): TableCell {
  return {
    stack: [
      { text: valor, style: 'kpiV' },
      { text: rotulo.toUpperCase(), style: 'kpiK' },
      { text: detalle, style: 'kpiD' },
    ],
    fillColor: '#ffffff',
    margin: [7, 6, 7, 7],
  };
}

/** Layout de tabla sobrio: sólo una línea bajo el encabezado y entre filas. */
const LAYOUT_FILAS = {
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
    i === 0 || i === node.table.body.length ? 0 : 0.5,
  vLineWidth: () => 0,
  hLineColor: () => GRID,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  paddingLeft: () => 0,
  paddingRight: () => 6,
};

const th = (t: string, right = false): TableCell => ({
  text: t.toUpperCase(),
  style: 'th',
  alignment: right ? 'right' : 'left',
});
const td = (t: string): TableCell => ({ text: t, style: 'td' });
const tdn = (t: string): TableCell => ({ text: t, style: 'tdn', alignment: 'right' });
const tdp = (t: string): TableCell => ({ text: t, style: 'tdp', alignment: 'right' });

/**
 * Arma el informe descargable a partir de los datos que devuelve el backend.
 *
 * A propósito **no trae conclusiones ni recomendaciones**: es la foto de lo que
 * midió el sistema en el rango pedido. La lectura la pone quien lo presenta.
 */
export function buildReport(r: MonitoringReport, appName: string): TDocumentDefinitions {
  const msgTotal = r.totals.messagesIn + r.totals.messagesOut;
  const dias = r.range.days;

  // ── hitos de la serie diaria ──
  const conTrafico = r.daily.filter((d) => d.messagesIn + d.messagesOut > 0);
  const pico = conTrafico.reduce(
    (a, b) => (b.messagesIn + b.messagesOut > a.messagesIn + a.messagesOut ? b : a),
    conTrafico[0] ?? { day: '', messagesIn: 0, messagesOut: 0, visits: 0 },
  );
  const valle = conTrafico.reduce(
    (a, b) => (b.messagesIn + b.messagesOut < a.messagesIn + a.messagesOut ? b : a),
    conTrafico[0] ?? { day: '', messagesIn: 0, messagesOut: 0, visits: 0 },
  );

  // ── promedio por día de la semana ──
  const semana = DIAS_SEMANA.map((nombre, dow) => {
    const propios = r.daily.filter((d) => weekday(d.day) === dow);
    const n = propios.length || 1;
    return {
      nombre,
      dias: propios.length,
      mensajes: propios.reduce((a, d) => a + d.messagesIn + d.messagesOut, 0) / n,
      visitas: propios.reduce((a, d) => a + d.visits, 0) / n,
    };
  }).filter((s) => s.dias > 0);
  const maxSemana = Math.max(...semana.map((s) => s.mensajes), 1);

  const content: Content[] = [];

  // ─────────────────────────── portada ───────────────────────────
  content.push({
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: appName.toUpperCase(), style: 'eyebrow' },
              { text: 'Informe de funcionamiento del asistente virtual', style: 'h1' },
              {
                text:
                  `Período analizado: ${fechaLarga(r.range.fromDay)} al ${fechaLarga(r.range.toDay)}` +
                  ` (${dias} ${dias === 1 ? 'día' : 'días'}) · ${nf(r.totals.people)} ciudadanos atendidos`,
                style: 'sub',
              },
            ],
            fillColor: NAVY,
            margin: [14, 12, 14, 13],
          },
        ],
      ],
    },
    layout: 'noBorders',
  });

  content.push({
    table: {
      widths: ['*', '*', '*', '*'],
      body: [
        [
          kpi(nf(r.totals.people), 'Ciudadanos atendidos', 'identificados por su número'),
          kpi(nf(r.totals.visits), 'Consultas atendidas', `${nf(r.totals.visits / dias)} por día en promedio`),
          kpi(nf(msgTotal), 'Mensajes procesados', `${nf(r.totals.messagesIn)} recibidos · ${nf(r.totals.messagesOut)} enviados`),
          kpi(
            pct(r.totals.visits - r.totals.handoffs, r.totals.visits, 0),
            'Resueltas por el bot',
            r.totals.handoffs ? `${nf(r.totals.handoffs)} derivadas a un operador` : 'sin derivar a un operador',
          ),
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => GRID,
      vLineColor: () => GRID,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 8, 0, 0],
  });

  // ─────────────────────────── 1. volumen ───────────────────────────
  content.push(seccion('1. Volumen de atención'));
  content.push({ svg: dailyChart(r.daily.map((d) => ({ day: d.day, visits: d.visits })), 700, 190), width: W });
  content.push(
    nota(
      'Consultas atendidas por día. Una consulta agrupa todos los mensajes de un mismo ciudadano ' +
        'hasta 30 minutos de inactividad; la columna más oscura es el día de mayor demanda.',
    ),
  );
  content.push({
    table: {
      widths: ['*', 'auto'],
      body: [
        [th('Indicador'), th('Valor', true)],
        [td(`Día de mayor demanda — ${fechaLarga(pico.day)}`), tdn(`${nf(pico.messagesIn + pico.messagesOut)} mensajes · ${nf(pico.visits)} consultas`)],
        [td(`Día de menor demanda — ${fechaLarga(valle.day)}`), tdn(`${nf(valle.messagesIn + valle.messagesOut)} mensajes · ${nf(valle.visits)} consultas`)],
        [td('Promedio diario'), tdn(`${nf(msgTotal / dias)} mensajes · ${nf(r.totals.visits / dias)} consultas`)],
        [td('Duración típica de una consulta'), tdn(`${segundos(r.engagement.medianVisitSeconds)} · ${nf(r.engagement.medianMessagesPerVisit)} mensajes`)],
        [
          td('Tiempo de respuesta del asistente'),
          tdn(
            r.engagement.replyP50Seconds === null
              ? '—'
              : `${dec(r.engagement.replyP50Seconds, 2)} s (mediana) · ${dec(r.engagement.replyP95Seconds ?? 0, 2)} s (p95)`,
          ),
        ],
        [
          td('Ciudadanos que resolvieron en una sola consulta'),
          tdn(`${nf(r.engagement.visitsPerPerson.one)} · ${pct(r.engagement.visitsPerPerson.one, r.totals.people)}`),
        ],
        [
          td('Ciudadanos que consultaron por primera vez'),
          tdn(`${nf(r.totals.newPeople)} · ${pct(r.totals.newPeople, r.totals.people)}`),
        ],
      ],
    },
    layout: LAYOUT_FILAS,
    margin: [0, 8, 0, 0],
  });
  content.push(
    nota(
      `Por cada mensaje recibido el asistente respondió ${dec(r.totals.messagesOut / Math.max(r.totals.messagesIn, 1), 2)}: ` +
        'contesta con menús, listados y documentos adjuntos.',
    ),
  );

  // ─────────────────────────── 2. horarios ───────────────────────────
  content.push(seccion('2. Distribución de la demanda'));
  content.push({ svg: hourlyChart(r.hourly, 700, 170), width: W });
  content.push(nota('Mensajes recibidos por hora, acumulado de todo el período. Horario de la Provincia de Buenos Aires.'));
  // Siete filas: que no se corten a la mitad entre dos páginas.
  content.push({
    unbreakable: true,
    stack: [
      {
        table: {
          widths: ['*', 110, 'auto', 'auto'],
          body: [
            [th('Día de la semana'), th(''), th('Mensajes', true), th('Consultas', true)],
            ...semana.map((s) => [
              td(s.nombre),
              { svg: cellBar(s.mensajes, maxSemana, 100), width: 100 } as TableCell,
              tdn(nf(s.mensajes)),
              tdn(nf(s.visitas)),
            ]),
          ],
        },
        layout: LAYOUT_FILAS,
      },
      nota('Promedio por día de la semana dentro del período. Sirve para dimensionar la atención.'),
    ],
    margin: [0, 10, 0, 0],
  });

  // ─────────────────────────── 3. recorridos ───────────────────────────
  content.push(seccion('3. Por dónde transitaron las consultas', true));
  if (r.events.truncated && r.events.availableFrom) {
    content.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              text:
                'El recorrido del asistente se registra desde el ' +
                `${fechaLarga(r.events.availableFrom.slice(0, 10))}. Los totales de mensajes y consultas ` +
                'de las secciones anteriores cubren todo el período, pero lo que sigue sólo considera ' +
                'las consultas posteriores a esa fecha.',
              style: 'aviso',
            },
          ],
        ],
      },
      layout: 'noBorders',
      margin: [0, 0, 0, 8],
    });
  }

  if (!r.topics.length) {
    content.push({ text: 'No hay recorridos registrados en el rango elegido.', style: 'td' });
  } else {
    const totalTemas = r.topics.reduce((a, t) => a + t.visits, 0);
    const maxTema = Math.max(...r.topics.map((t) => t.visits), 1);
    content.push({
      table: {
        widths: ['*', 120, 'auto', 'auto'],
        body: [
          [th('Sección del asistente'), th(''), th('Consultas', true), th('% del total', true)],
          ...r.topics.map((t) => [
            td(t.topicId),
            { svg: cellBar(t.visits, maxTema, 110), width: 110 } as TableCell,
            tdn(nf(t.visits)),
            tdp(pct(t.visits, r.totals.visits)),
          ]),
        ],
      },
      layout: LAYOUT_FILAS,
    });
    content.push(
      nota(
        `Los porcentajes se miden sobre las ${nf(r.totals.visits)} consultas del período y pueden sumar más de ` +
          `100 %: una misma consulta puede recorrer más de una sección (${nf(totalTemas)} pasadas en total).`,
      ),
    );

    // Un ranking por tema: los pasos más transitados, de mayor a menor alcance.
    for (const t of r.topics.filter((x) => x.nodes.length)) {
      content.push(...temaDetalle(t));
    }
  }

  // ─────────────────────────── 4. documentos ───────────────────────────
  if (r.media.attempts > 0) {
    content.push(seccion('4. Documentos entregados', true));
    const otras = r.media.byError
      .filter((e) => e.error !== 'ok' && e.error !== 'http-error')
      .reduce((a, e) => a + e.count, 0);
    const origen = r.media.failed - otras;
    const segs = [
      { label: 'Documento entregado', value: r.media.delivered, color: OK },
      { label: 'No generado por el sistema de origen', value: origen, color: BAD },
      { label: 'Otras fallas técnicas del envío', value: otras, color: WARN },
    ].filter((s) => s.value > 0);

    content.push({ svg: stackedBar(segs, 700, 30), width: W });
    content.push({
      table: {
        widths: [10, '*', 'auto', 'auto'],
        body: [
          ...segs.map((s) => [
            { svg: `<svg width="8" height="8"><rect width="8" height="8" rx="2" fill="${s.color}"/></svg>`, width: 8 } as TableCell,
            td(s.label),
            tdn(nf(s.value)),
            tdp(pct(s.value, r.media.attempts)),
          ]),
          [
            { text: '', border: [false, false, false, false] } as TableCell,
            { text: 'Total de pedidos', style: 'tdTot' },
            { text: nf(r.media.attempts), style: 'tdTot', alignment: 'right' },
            { text: '100 %', style: 'tdTot', alignment: 'right' },
          ],
        ],
      },
      layout: LAYOUT_FILAS,
      margin: [0, 9, 0, 0],
    });
    content.push(
      nota(
        'Cada pedido de un documento dispara una descarga contra el sistema que lo genera y su posterior ' +
          'envío por el canal. "No generado" son los pedidos que el sistema de origen respondió con error.',
      ),
    );

    if (r.media.byNode.length) {
      content.push({
        table: {
          widths: ['*', 'auto', 'auto', 'auto', 'auto'],
          body: [
            [th('Documento (nodo del flujo)'), th('Pedidos', true), th('Entregados', true), th('Éxito', true), th('Demora', true)],
            ...r.media.byNode.map((m) => [
              celdaNodo(r, m.topicId, m.nodeId),
              tdn(nf(m.attempts)),
              tdn(nf(m.delivered)),
              tdp(pct(m.delivered, m.attempts)),
              tdp(m.p50Ms === null ? '—' : `${nf(m.p50Ms)} ms`),
            ]),
          ],
        },
        layout: LAYOUT_FILAS,
        margin: [0, 10, 0, 0],
      });
      content.push(nota('Demora: mediana de lo que tardó el sistema de origen en devolver el archivo.'));
    }
  }

  // ─────────────────────────── 5. servicios externos ───────────────────────────
  if (r.http.length) {
    const llamadas = r.http.reduce((a, h) => a + h.calls, 0);
    const errores = r.http.reduce((a, h) => a + h.errors, 0);
    content.push(seccion('5. Servicios externos consultados'));
    content.push({
      table: {
        widths: ['*', 'auto', 'auto', 'auto', 'auto'],
        body: [
          [th('Servicio (nodo del flujo)'), th('Llamadas', true), th('Con error', true), th('Mediana', true), th('p95', true)],
          ...r.http.map((h) => [
            {
              stack: [
                { text: etiquetaNodo(r, h.topicId, h.nodeId), style: 'td' },
                ...(h.endpoint ? [{ text: endpointCorto(h.endpoint), style: 'tdMono' }] : []),
              ],
            } as TableCell,
            tdn(nf(h.calls)),
            tdn(nf(h.errors)),
            tdp(h.p50Ms === null ? '—' : `${nf(h.p50Ms)} ms`),
            tdp(h.p95Ms === null ? '—' : `${nf(h.p95Ms)} ms`),
          ]),
          [
            { text: 'Total', style: 'tdTot' },
            { text: nf(llamadas), style: 'tdTot', alignment: 'right' },
            { text: nf(errores), style: 'tdTot', alignment: 'right' },
            { text: `${pct(llamadas - errores, llamadas, 2)} disp.`, style: 'tdTot', alignment: 'right', colSpan: 2 },
            {},
          ],
        ],
      },
      layout: LAYOUT_FILAS,
    });
    content.push(
      nota(
        'Llamadas que el asistente hizo a sistemas de terceros durante el período. La dirección se muestra ' +
          'sin sus parámetros, que pueden contener datos del ciudadano.',
      ),
    );
  }

  // ─────────────────────────── 6. fricción ───────────────────────────
  if (r.captures.length) {
    const totalFric = r.captures.reduce((a, c) => a + c.invalid, 0);
    const maxFric = Math.max(...r.captures.map((c) => c.invalid), 1);
    content.push(seccion('6. Datos que más cuesta ingresar'));
    content.push({
      table: {
        widths: ['*', 110, 'auto', 'auto'],
        body: [
          [th('Dato pedido (nodo del flujo)'), th(''), th('Reintentos', true), th('% del total', true)],
          ...r.captures.map((c) => [
            celdaNodo(r, c.topicId, c.nodeId),
            { svg: cellBar(c.invalid, maxFric, 100), width: 100 } as TableCell,
            tdn(nf(c.invalid)),
            tdp(pct(c.invalid, totalFric)),
          ]),
          [
            { text: 'Total de reintentos guiados', style: 'tdTot' },
            { text: '', style: 'tdTot' },
            { text: nf(totalFric), style: 'tdTot', alignment: 'right' },
            { text: '100 %', style: 'tdTot', alignment: 'right' },
          ],
        ],
      },
      layout: LAYOUT_FILAS,
    });
    content.push(
      nota(
        'Veces que el ciudadano escribió un dato con un formato que el asistente no pudo interpretar y se lo ' +
          'volvió a pedir. No son consultas perdidas: miden dónde el trámite se vuelve incómodo.',
      ),
    );
  }

  // ─────────────────────────── nota metodológica ───────────────────────────
  content.push(seccion('Nota metodológica'));
  content.push({
    text:
      `Los datos provienen del registro de operación del asistente entre el ${fechaLarga(r.range.fromDay)} y el ` +
      `${fechaLarga(r.range.toDay)} inclusive, en horario de la Provincia de Buenos Aires. Una consulta agrupa ` +
      'todos los mensajes intercambiados con un mismo ciudadano hasta 30 minutos de inactividad; un ciudadano es ' +
      'un número de contacto único. Los recorridos se cuentan por consulta: si una misma consulta pasa dos veces ' +
      'por el mismo paso, cuenta una sola vez, y por eso los subtotales de ramas distintas pueden sumar más del ' +
      '100 %. Este informe presenta lo que el sistema midió, sin interpretaciones ni recomendaciones.',
    style: 'metodo',
  });

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: MARGINS,
    info: {
      title: `Informe de funcionamiento — ${r.range.fromDay} a ${r.range.toDay}`,
      author: appName,
    },
    defaultStyle: { font: 'Helvetica', fontSize: 9, color: INK2, lineHeight: 1.25 },
    footer: (page: number, total: number) => ({
      columns: [
        { text: `${appName} · informe generado el ${fechaLarga(new Date(r.generatedAt).toISOString().slice(0, 10))}`, style: 'foot' },
        { text: `Página ${page} de ${total}`, style: 'foot', alignment: 'right' },
      ],
      margin: [34, 12, 34, 0],
    }),
    content,
    styles: {
      eyebrow: { fontSize: 7.5, color: '#b6c7f0', characterSpacing: 1, margin: [0, 0, 0, 5] },
      h1: { fontSize: 16, bold: true, color: '#ffffff', margin: [0, 0, 0, 5] },
      sub: { fontSize: 8.5, color: '#d3ddf7', lineHeight: 1.3 },
      h2: { fontSize: 11, bold: true, color: NAVY, margin: [8, 4, 0, 4] },
      h3: { fontSize: 9.5, bold: true, color: INK, margin: [0, 0, 0, 2] },
      th: { fontSize: 6.8, bold: true, color: MUTED, characterSpacing: 0.4 },
      td: { fontSize: 8.4, color: INK2 },
      tdn: { fontSize: 8.4, bold: true, color: INK },
      tdp: { fontSize: 8.4, color: MUTED },
      tdMono: { fontSize: 6.6, color: MUTED },
      tdTot: { fontSize: 8.4, bold: true, color: INK },
      kpiV: { fontSize: 16, bold: true, color: NAVY },
      kpiK: { fontSize: 6.6, color: MUTED, characterSpacing: 0.3, margin: [0, 3, 0, 0] },
      kpiD: { fontSize: 7, color: INK2, margin: [0, 2, 0, 0], lineHeight: 1.2 },
      nota: { fontSize: 7.4, color: MUTED, lineHeight: 1.3 },
      aviso: { fontSize: 7.6, color: '#8a6100', lineHeight: 1.3 },
      metodo: { fontSize: 7.8, color: INK2, lineHeight: 1.4 },
      foot: { fontSize: 6.8, color: MUTED },
    },
  };
}

/**
 * Pasos que el ciudadano efectivamente vive: los que le muestran algo o le
 * piden algo. Se dejan afuera los internos del flujo —asignar una variable,
 * evaluar una condición, esperar, llamar a un servicio—, que no son etapas de
 * su recorrido y llenarían el listado de ruido (`set_token`, `cond_tipo`). Las
 * llamadas a servicios tienen su propia sección.
 */
const KINDS_VISIBLES = new Set(['MENU', 'MESSAGE', 'CAPTURE', 'MEDIA', 'MEDIA_FROM_URL', 'HANDOFF']);

/** Bloque de un tema: cuántas consultas lo recorrieron y sus pasos más transitados. */
function temaDetalle(t: ReportTopic): Content[] {
  const TOPE = 12;
  const visibles = t.nodes.filter((n) => !n.nodeKind || KINDS_VISIBLES.has(n.nodeKind));
  // Si el flujo no registró el tipo de sus nodos, mejor mostrarlos todos que nada.
  const candidatos = visibles.length ? visibles : t.nodes;

  // Dos nodos distintos pueden mostrar el mismo texto ("Elegí tu consulta" en
  // dos menús). Cuando pasa, se agrega el id para poder diferenciarlos.
  const conteo = new Map<string, number>();
  for (const n of candidatos) conteo.set(nodeLabel(n), (conteo.get(nodeLabel(n)) ?? 0) + 1);

  const filas = candidatos.slice(0, TOPE).map((nodo) => {
    const base = nodeLabel(nodo);
    return {
      label: (conteo.get(base) ?? 0) > 1 ? `${nodeLabel(nodo, 34)} · ${nodo.nodeId}` : base,
      value: nodo.visits,
    };
  });
  const restantes = candidatos.length - filas.length;
  // Título, gráfico y nota viajan juntos: si no entran, pasan enteros a la
  // página siguiente en vez de dejar el título colgado al pie.
  return [
    {
      unbreakable: true,
      margin: [0, 12, 0, 0],
      stack: [
        { text: `${t.topicId} — ${nf(t.visits)} consultas`, style: 'h3', margin: [0, 0, 0, 4] },
        { svg: rankingChart(filas, t.visits, 700, 30), width: W },
        nota(
          'Pasos por los que pasaron más consultas, de mayor a menor alcance. Se listan los que el ' +
            'ciudadano ve o responde; quedan afuera los pasos internos del flujo. El porcentaje es sobre ' +
            `las ${nf(t.visits)} consultas que entraron a la sección` +
            (restantes > 0 ? `; hay ${restantes} pasos más con menor alcance.` : '.'),
        ),
      ],
    },
  ];
}

/** El texto del nodo si el flujo lo registró; si no, su id técnico. */
function etiquetaNodo(r: MonitoringReport, topicId: string | null, nodeId: string): string {
  const tema = r.topics.find((t) => t.topicId === (topicId ?? '(sin tema)'));
  const nodo = tema?.nodes.find((x) => x.nodeId === nodeId);
  return nodo ? nodeLabel(nodo, 52) : nodeId;
}

/**
 * Celda de nodo: el texto arriba y el id técnico abajo. Dos nodos distintos
 * pueden mostrar el mismo texto —pedir el número de infracción para el acta y
 * para el cupón usa el mismo prompt—, y sin el id la fila queda repetida.
 */
function celdaNodo(r: MonitoringReport, topicId: string | null, nodeId: string): TableCell {
  const etiqueta = etiquetaNodo(r, topicId, nodeId);
  if (etiqueta === nodeId) return td(nodeId);
  return { stack: [{ text: etiqueta, style: 'td' }, { text: nodeId, style: 'tdMono' }] };
}
