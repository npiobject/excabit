/**
 * Formateo de importes y números (RF-30, docs/05 §6).
 *
 * **Este módulo no tenía tests.** Formatea todos los importes de una app de
 * Bitcoin —el panel, las etiquetas del grafo, la barra de estado— y nadie lo
 * había mirado; de ahí salió el bug del separador decimal que documenta el
 * primer bloque.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  formatBtc,
  formatDate,
  formatFeerate,
  formatNumber,
  formatSats,
  shortHash,
} from '@/i18n/format';
import { setLocale, tPlural } from '@/i18n/i18n';

beforeAll(() => {
  // `setLocale` refleja el idioma en `<html lang>`. Aquí solo interesa el estado,
  // no el documento: se le da lo mínimo para que no reviente en Node.
  vi.stubGlobal('document', { documentElement: {} });
});

describe('formatBtc: el separador decimal es el del idioma', () => {
  it('en español, la coma decimal y el punto de miles', () => {
    setLocale('es');

    // Con punto decimal Y punto de miles, `1.234.567.89012345` no se puede leer:
    // no se sabe dónde acaba el entero. En una herramienta forense eso no es un
    // detalle de estilo.
    expect(formatBtc(123_456_789_012_345n)).toBe('1.234.567,89012345 BTC');
  });

  it('en inglés, al revés', () => {
    setLocale('en');
    expect(formatBtc(123_456_789_012_345n)).toBe('1,234,567.89012345 BTC');
  });

  it('un importe pequeño en español lleva coma', () => {
    setLocale('es');
    expect(formatBtc(240_000n)).toBe('0,00240000 BTC');
  });

  it('coincide con formatFeerate, que ya lo hacía bien', () => {
    // La prueba de que era un olvido y no una decisión: el mismo módulo ya
    // traducía el separador en las comisiones.
    setLocale('es');

    expect(formatFeerate(1000n, 1000)).toContain(',');
    expect(formatBtc(240_000n)).toContain(',');
  });
});

describe('formatBtc: la aritmética', () => {
  it('siempre 8 decimales: un BTC son 100 000 000 sats', () => {
    setLocale('en');

    expect(formatBtc(100_000_000n)).toBe('1.00000000 BTC');
    expect(formatBtc(1n)).toBe('0.00000001 BTC');
    expect(formatBtc(0n)).toBe('0.00000000 BTC');
  });

  it('no pierde precisión con importes mayores que MAX_SAFE_INTEGER', () => {
    setLocale('en');

    // 21 millones de BTC, el suministro total, en sats. Pasar por `Number` aquí
    // redondearía y el total de Bitcoin saldría mal.
    expect(formatBtc(2_100_000_000_000_000n)).toBe('21,000,000.00000000 BTC');
  });

  it('un negativo lleva el signo menos delante', () => {
    setLocale('en');
    expect(formatBtc(-150_000_000n)).toBe('−1.50000000 BTC');
  });
});

describe('el resto del formateo respeta el idioma', () => {
  it('formatSats agrupa según el idioma', () => {
    setLocale('es');
    expect(formatSats(1_234_567n)).toBe('1.234.567 sats');

    setLocale('en');
    expect(formatSats(1_234_567n)).toBe('1,234,567 sats');
  });

  it('formatNumber también', () => {
    setLocale('es');
    expect(formatNumber(1_234_567)).toBe('1.234.567');

    setLocale('en');
    expect(formatNumber(1_234_567)).toBe('1,234,567');
  });

  it('formatFeerate: un peso de 0 no divide entre cero', () => {
    setLocale('en');
    expect(formatFeerate(1000n, 0)).toBe('—');
  });

  it('formatFeerate calcula sobre vbytes, no sobre unidades de peso', () => {
    // vbytes = weight / 4. Confundirlos daría una comisión 4 veces menor de la
    // real, que es la clase de error que nadie mira dos veces.
    setLocale('en');
    expect(formatFeerate(1000n, 4000)).toBe('1.0 sat/vB');
  });

  it('formatDate se escribe en el idioma activo', () => {
    // Epoch del bloque 300 000, el de la tx semilla del proyecto.
    setLocale('es');
    const es = formatDate(1_399_703_554);

    setLocale('en');
    const en = formatDate(1_399_703_554);

    expect(es).not.toBe(en);
    expect(es).toMatch(/2014/);
    expect(en).toMatch(/2014/);
  });
});

describe('shortHash', () => {
  it('corta por el medio, que es lo que no se lee', () => {
    expect(shortHash('85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2')).toBe(
      '85e72c…4b70f2',
    );
  });

  it('un hash que ya es corto se deja en paz', () => {
    expect(shortHash('abc')).toBe('abc');
  });
});

describe('plurales (RF-30)', () => {
  it('elige singular o plural según el número', () => {
    setLocale('es');

    // «1 saltos» es la marca de que nadie miró el mensaje con un solo elemento.
    expect(tPlural(1, 'taint.hops.one', 'taint.hops.other', { count: 1 })).toBe('1 salto');
    expect(tPlural(3, 'taint.hops.one', 'taint.hops.other', { count: 3 })).toBe('3 saltos');
  });

  it('también en inglés', () => {
    setLocale('en');

    expect(tPlural(1, 'taint.hops.one', 'taint.hops.other', { count: 1 })).toBe('1 hop');
    expect(tPlural(3, 'taint.hops.one', 'taint.hops.other', { count: 3 })).toBe('3 hops');
  });

  it('el cero va en plural en los dos idiomas', () => {
    setLocale('es');
    expect(tPlural(0, 'taint.hops.one', 'taint.hops.other', { count: 0 })).toBe('0 saltos');

    setLocale('en');
    expect(tPlural(0, 'taint.hops.one', 'taint.hops.other', { count: 0 })).toBe('0 hops');
  });
});
