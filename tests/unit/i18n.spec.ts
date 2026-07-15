import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import es from '@/i18n/es.json';
import en from '@/i18n/en.json';

const SRC = join(process.cwd(), 'src');

/** Todos los .ts/.html/.css bajo src/, para el escaneo estático. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (/\.(ts|html)$/.test(entry)) found.push(path);
  }

  return found;
}

describe('RF-30 — paridad de idiomas', () => {
  it('es.json y en.json tienen exactamente las mismas claves', () => {
    const spanish = Object.keys(es).sort();
    const english = Object.keys(en).sort();

    expect(english).toEqual(spanish);
  });

  it('ninguna traducción está vacía', () => {
    for (const [key, value] of Object.entries({ ...es, ...en })) {
      expect(value, `clave vacía: ${key}`).not.toBe('');
    }
  });

  it('las traducciones inglesas no son copias literales del español', () => {
    // Salvo las que legítimamente coinciden: nombres propios, redes y los
    // tecnicismos que en español se usan en inglés (el propio mock escribe
    // «Fee», «Feerate» y «RBF» en su versión española). Cada excepción está
    // aquí a propósito: la lista obliga a revisarlas una a una.
    const allowed = new Set([
      'app.name',
      'network.mainnet',
      'network.testnet',
      'network.signet',
      'status.provider',
      'details.fee',
      'details.feerate',
      'details.rbf',
      'status.zoom',
    ]);

    const identical = Object.keys(es).filter(
      (key) => !allowed.has(key) && es[key as keyof typeof es] === en[key as keyof typeof en],
    );

    expect(identical).toEqual([]);
  });

  it('los placeholders {x} coinciden entre idiomas', () => {
    const placeholders = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();

    for (const key of Object.keys(es) as (keyof typeof es)[]) {
      expect(placeholders(en[key]), `placeholders distintos en ${key}`).toEqual(
        placeholders(es[key]),
      );
    }
  });
});

describe('RF-30 — escaneo estático del código', () => {
  const files = sourceFiles(SRC);
  const sources = files.map((path) => readFileSync(path, 'utf8'));

  it('ninguna clave usada en el código falta en los json', () => {
    const known = new Set(Object.keys(es));
    const missing = new Set<string>();

    for (const source of sources) {
      // t('clave') y data-i18n="clave"
      for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z][\w.-]*)'/g)) {
        const key = match[1]!;
        if (!known.has(key)) missing.add(key);
      }
      for (const match of source.matchAll(/data-i18n="([\w.-]+)"/g)) {
        const key = match[1]!;
        if (!known.has(key)) missing.add(key);
      }
    }

    expect([...missing]).toEqual([]);
  });

  it('cada heurística del catálogo tiene nombre y explicación traducidos (RF-16)', () => {
    const ids = [
      'change-largest-output',
      'unnecessary-input',
      'script-type-mismatch',
      'taproot-payment',
      'format-change',
      'round-amount',
      'address-reuse',
      'tx-version-locktime',
      'common-input-ownership',
    ];

    for (const id of ids) {
      expect(Object.keys(es)).toContain(`heuristic.${id}.name`);
      // RF-16 pide explicación pedagógica, no solo el nombre: la promesa de
      // la app es enseñar la heurística, no soltar un veredicto.
      expect(Object.keys(es)).toContain(`heuristic.${id}.description`);
    }
  });
});
