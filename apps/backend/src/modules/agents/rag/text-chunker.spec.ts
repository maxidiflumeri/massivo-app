import { chunkText } from './text-chunker';

describe('chunkText', () => {
  it('texto corto → un solo chunk', () => {
    expect(chunkText('Hola mundo')).toEqual([{ index: 0, content: 'Hola mundo' }]);
  });

  it('vacío o whitespace → sin chunks', () => {
    expect(chunkText('   \n\n  ')).toEqual([]);
    expect(chunkText('')).toEqual([]);
  });

  it('parte texto largo en varios chunks ≤ maxChars con índices consecutivos', () => {
    const big = 'palabra '.repeat(400); // ~3.2k chars, sin puntuación (oración monstruo)
    const r = chunkText(big, 1000, 150);
    expect(r.length).toBeGreaterThan(1);
    r.forEach((c, i) => expect(c.index).toBe(i));
    r.forEach((c) => expect(c.content.length).toBeLessThanOrEqual(1000));
    // No pierde contenido: la suma (sin contar overlap) cubre todo el texto.
    const joined = r.map((c) => c.content).join('');
    expect(joined.length).toBeGreaterThanOrEqual(big.trim().length);
  });

  it('respeta límites de párrafo al agrupar', () => {
    const text = ['A'.repeat(500), 'B'.repeat(500), 'C'.repeat(500)].join('\n\n');
    const r = chunkText(text, 1100, 100);
    // 500+500 caben juntos (1001 ≤ 1100); C arranca chunk nuevo.
    expect(r.length).toBe(2);
  });
});
