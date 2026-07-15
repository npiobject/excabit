import { describe, it, expect } from 'vitest';
import { privacyScore, scoreBadge, analyzeTx, PENALTY } from '@/analysis/score';
import { normalizeTx } from '@/data/normalizer';
import type { HeuristicResult } from '@/analysis/types';
import { txWith } from '@tests/helpers/tx-builder';
import canonical from '@tests/fixtures/mempool/tx-85e72c08.json';

const result = (confidence: HeuristicResult['confidence'], outcome: HeuristicResult['outcome']) =>
  ({ id: 'address-reuse', outcome, confidence }) as HeuristicResult;

describe('privacyScore', () => {
  it('0 heurísticas detectadas → 100', () => {
    expect(privacyScore([])).toBe(100);
    expect(privacyScore([result('high', 'not-applicable')])).toBe(100);
    expect(privacyScore([result('high', 'insufficient-data')])).toBe(100);
  });

  it('penaliza high=25, medium=15, low=8', () => {
    expect(privacyScore([result('high', 'detected')])).toBe(75);
    expect(privacyScore([result('medium', 'detected')])).toBe(85);
    expect(privacyScore([result('low', 'detected')])).toBe(92);
    expect(PENALTY).toEqual({ high: 25, medium: 15, low: 8, info: 0 });
  });

  it('una heurística informativa no penaliza aunque estuviera detectada', () => {
    expect(privacyScore([result('info', 'detected')])).toBe(100);
  });

  it('las penalizaciones se suman', () => {
    expect(privacyScore([result('high', 'detected'), result('medium', 'detected')])).toBe(60);
  });

  it('nunca baja de 0 aunque se detecte todo', () => {
    const todas = Array.from({ length: 9 }, () => result('high', 'detected'));

    expect(privacyScore(todas)).toBe(0);
  });

  it('solo `detected` penaliza', () => {
    const mixtas = [
      result('high', 'not-applicable'),
      result('high', 'insufficient-data'),
      result('medium', 'detected'),
    ];

    expect(privacyScore(mixtas)).toBe(85);
  });
});

describe('scoreBadge — umbrales (docs/04)', () => {
  it('≥ 80 → verde', () => {
    expect(scoreBadge(100)).toBe('green');
    expect(scoreBadge(80)).toBe('green');
  });

  it('40-79 → ámbar', () => {
    expect(scoreBadge(79)).toBe('amber');
    expect(scoreBadge(40)).toBe('amber');
  });

  it('< 40 → rojo', () => {
    expect(scoreBadge(39)).toBe('red');
    expect(scoreBadge(0)).toBe('red');
  });
});

describe('analyzeTx — todas las heurísticas sobre una tx', () => {
  it('devuelve un resultado por heurística, sin repetir ids', () => {
    const analysis = analyzeTx(txWith());
    const ids = analysis.results.map((r) => r.id);

    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
  });

  it('la tx real 85e72c… → score 60', () => {
    // Verificado contra el fixture real, no estimado: dispara address-reuse
    // (high, −25) y unnecessary-input (medium, −15).
    //
    // docs/09 predecía 52 (= high+medium+low) asumiendo que además saltaría una
    // heurística low. No salta ninguna: H-01 exige 1 entrada y esta tiene 2, y
    // H-06 se descarta porque AMBAS salidas son redondas (50.000.000.000 y
    // 3.399.980.000), que es justo su vector V4. Corregido en docs/09 y docs/08.
    const tx = normalizeTx(canonical);
    const analysis = analyzeTx(tx);

    expect(analysis.score).toBe(60);
    expect(analysis.badge).toBe('amber');

    const detected = analysis.results.filter((r) => r.outcome === 'detected').map((r) => r.id);
    expect(detected).toEqual(['unnecessary-input', 'address-reuse']);
  });

  it('una tx sin patrones detectables puntúa 100 (verde)', () => {
    const tx = txWith({
      ins: [{ address: 'A', value: 500_000n }],
      outs: [
        { address: 'B', value: 123_456n },
        { address: 'C', value: 371_337n },
      ],
    });
    const analysis = analyzeTx(tx);

    expect(analysis.score).toBe(100);
    expect(analysis.badge).toBe('green');
  });

  it('es pura: no muta la tx analizada', () => {
    const tx = txWith({ ins: [{ address: 'A' }], outs: [{ address: 'A' }, { address: 'B' }] });
    const before = structuredClone(tx);

    analyzeTx(tx);

    expect(tx).toEqual(before);
  });

  it('la reutilización de dirección se lleva la penalización más alta', () => {
    const tx = txWith({
      ins: [{ address: 'A', value: 500_000n }],
      outs: [
        { address: 'A', value: 371_337n },
        { address: 'B', value: 123_456n },
      ],
    });
    const analysis = analyzeTx(tx);

    expect(analysis.score).toBe(75);
    expect(analysis.badge).toBe('amber');
  });
});
