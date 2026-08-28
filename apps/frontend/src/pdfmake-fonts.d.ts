/**
 * Las fuentes estándar de pdfmake se publican como scripts sueltos, sin tipos.
 * Cada una exporta un "font container": las métricas AFM más el descriptor de
 * variantes, listo para `pdfMake.addFontContainer()`.
 */
declare module 'pdfmake/build/standard-fonts/Helvetica' {
  import type { TFontContainer } from 'pdfmake/interfaces';
  const fontContainer: TFontContainer;
  export default fontContainer;
}
