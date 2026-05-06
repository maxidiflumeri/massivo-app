import { interpolate } from './interpolate';

describe('interpolate', () => {
  it('reemplaza una variable simple', () => {
    expect(interpolate('Hola {{nombre}}', { nombre: 'Maxi' })).toBe('Hola Maxi');
  });
  it('reemplaza múltiples variables', () => {
    expect(interpolate('{{a}} y {{b}}', { a: 'uno', b: 'dos' })).toBe('uno y dos');
  });
  it('vacía variable ausente', () => {
    expect(interpolate('Hola {{nombre}}!', {})).toBe('Hola !');
  });
  it('castea no-strings', () => {
    expect(interpolate('Total: {{n}}', { n: 42 })).toBe('Total: 42');
    expect(interpolate('Activo: {{x}}', { x: true })).toBe('Activo: true');
  });
  it('vars null/undefined dan vacío', () => {
    expect(interpolate('a={{a}} b={{b}}', { a: null, b: undefined })).toBe('a= b=');
  });
  it('tolera espacios alrededor del nombre', () => {
    expect(interpolate('{{  v  }}', { v: 'ok' })).toBe('ok');
  });
  it('ignora patrones inválidos', () => {
    expect(interpolate('{{1bad}} {{ok}}', { ok: 'x', '1bad': 'y' })).toBe('{{1bad}} x');
  });
  it('vars=null saca todos los tokens', () => {
    expect(interpolate('Hola {{nombre}}', null)).toBe('Hola ');
  });
  it('template vacío devuelve igual', () => {
    expect(interpolate('', { x: 'y' })).toBe('');
  });
});
