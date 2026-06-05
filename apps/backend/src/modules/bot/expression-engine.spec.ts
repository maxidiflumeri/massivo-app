import {
  _resetCacheForTests,
  compile,
  evaluateExpression,
  hasExpressionTokens,
  interpolateExpressionTokens,
} from './expression-engine';

describe('expression-engine', () => {
  beforeEach(() => _resetCacheForTests());

  describe('compile', () => {
    it('compila una expresión válida', () => {
      expect(() => compile('a.b.c')).not.toThrow();
    });

    it('tira al compilar una expresión inválida', () => {
      expect(() => compile('a.b.')).toThrow();
    });

    it('cachea expresiones idénticas (mismo objeto retornado)', () => {
      const e1 = compile('foo.bar');
      const e2 = compile('foo.bar');
      expect(e1).toBe(e2);
    });
  });

  describe('hasExpressionTokens', () => {
    it('detecta el patrón {{= expr }}', () => {
      expect(hasExpressionTokens('hola {{= nombre }} qué tal')).toBe(true);
    });

    it('ignora {{var}} plano (sin signo igual)', () => {
      expect(hasExpressionTokens('hola {{ nombre }}')).toBe(false);
      expect(hasExpressionTokens('hola {{nombre}}')).toBe(false);
    });

    it('false en strings sin tokens', () => {
      expect(hasExpressionTokens('texto plano')).toBe(false);
      expect(hasExpressionTokens('')).toBe(false);
    });

    it('reinicia lastIndex (regex global) entre llamadas', () => {
      const s = '{{= a }}';
      expect(hasExpressionTokens(s)).toBe(true);
      expect(hasExpressionTokens(s)).toBe(true);
    });
  });

  describe('evaluateExpression', () => {
    it('navega paths anidados', async () => {
      const r = await evaluateExpression('pedidos[0].total', {
        pedidos: [{ total: 1500 }, { total: 800 }],
      });
      expect(r).toBe(1500);
    });

    it('usa funciones built-in ($count, $sum)', async () => {
      const r = await evaluateExpression('$count(items)', { items: [1, 2, 3, 4] });
      expect(r).toBe(4);
      const s = await evaluateExpression('$sum(items)', { items: [1, 2, 3, 4] });
      expect(s).toBe(10);
    });

    it('filtra arrays con $filter', async () => {
      const r = await evaluateExpression('items[activo = true].id', {
        items: [
          { id: 'a', activo: true },
          { id: 'b', activo: false },
          { id: 'c', activo: true },
        ],
      });
      // JSONata 2.x devuelve un "sequence" (array-like con metadata interno) — normalizamos
      // a array plano vía JSON-roundtrip para comparar deep-equal.
      expect(JSON.parse(JSON.stringify(r))).toEqual(['a', 'c']);
    });

    it('compone strings', async () => {
      const r = await evaluateExpression('nombre & " " & apellido', {
        nombre: 'Juan',
        apellido: 'Pérez',
      });
      expect(r).toBe('Juan Pérez');
    });

    it('boolean en condiciones', async () => {
      const r = await evaluateExpression('total > 1000', { total: 1500 });
      expect(r).toBe(true);
      const r2 = await evaluateExpression('total > 1000', { total: 500 });
      expect(r2).toBe(false);
    });

    it('devuelve undefined si el path no existe (sin tirar)', async () => {
      const r = await evaluateExpression('no.existe', {});
      expect(r).toBeUndefined();
    });
  });

  describe('interpolateExpressionTokens', () => {
    it('reemplaza un token simple', async () => {
      const r = await interpolateExpressionTokens('Hola {{= nombre }}', { nombre: 'Juan' });
      expect(r).toBe('Hola Juan');
    });

    it('reemplaza múltiples tokens en paralelo', async () => {
      const r = await interpolateExpressionTokens(
        '{{= nombre }} tiene {{= $count(items) }} items',
        { nombre: 'Ana', items: [1, 2, 3] },
      );
      expect(r).toBe('Ana tiene 3 items');
    });

    it('NO toca {{var}} plano (sintaxis distinta)', async () => {
      const r = await interpolateExpressionTokens('Hola {{ nombre }} {{= nombre }}', {
        nombre: 'Ana',
      });
      expect(r).toBe('Hola {{ nombre }} Ana');
    });

    it('valor undefined/null → string vacío', async () => {
      const r = await interpolateExpressionTokens('valor: "{{= falta }}"', {});
      expect(r).toBe('valor: ""');
    });

    it('objetos/arrays se serializan a JSON', async () => {
      const r = await interpolateExpressionTokens('data: {{= obj }}', {
        obj: { a: 1, b: [2, 3] },
      });
      expect(r).toBe('data: {"a":1,"b":[2,3]}');
    });

    it('expresión inválida en runtime → string vacío (no rompe el texto)', async () => {
      const r = await interpolateExpressionTokens('a {{= no.path.valid[. = $foo()] }} b', {});
      // El parse pasa pero la evaluación puede fallar; si no falla, devuelve undefined → ''.
      expect(r.startsWith('a ')).toBe(true);
      expect(r.endsWith(' b')).toBe(true);
    });

    it('boolean → "true"/"false"', async () => {
      const r = await interpolateExpressionTokens('activo: {{= ok }}', { ok: true });
      expect(r).toBe('activo: true');
    });

    it('número → string', async () => {
      const r = await interpolateExpressionTokens('total: {{= 1 + 2 }}', {});
      expect(r).toBe('total: 3');
    });

    it('template sin tokens devuelve el original sin tocar', async () => {
      const r = await interpolateExpressionTokens('hola mundo', {});
      expect(r).toBe('hola mundo');
    });

    it('data null/undefined → reemplaza con strings vacíos sin tirar', async () => {
      const r = await interpolateExpressionTokens('hola {{= nombre }}', null);
      expect(r).toBe('hola ');
    });

    it('soporta espacios alrededor de la expresión', async () => {
      const r = await interpolateExpressionTokens('{{=nombre}} y {{=   nombre   }}', {
        nombre: 'Eva',
      });
      expect(r).toBe('Eva y Eva');
    });
  });
});
