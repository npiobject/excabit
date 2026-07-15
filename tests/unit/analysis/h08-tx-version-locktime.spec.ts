import { describe, it, expect } from 'vitest';
import { txVersionLocktime } from '@/analysis/heuristics/h08-tx-version-locktime';
import { txWith } from '@tests/helpers/tx-builder';

describe('H-08 tx-version-locktime', () => {
  it('BUG-009: informa, pero NUNCA emite veredicto de cambio', () => {
    // El legacy listaba `versionesDeTxs` en la UI como si evaluase algo, pero
    // era un stub que calculaba longitudes y devolvía siempre false. El usuario
    // veía un "resultado" que no analizaba nada.
    const detected = txVersionLocktime(txWith({ version: 2, locktime: 700_000 }));
    const plain = txVersionLocktime(txWith({ version: 1, locktime: 0 }));

    expect(detected.outcome).toBe('not-applicable');
    expect(plain.outcome).toBe('not-applicable');
  });

  it('su confianza es info: no es una heurística de cambio', () => {
    const result = txVersionLocktime(txWith());

    expect(result.confidence).toBe('info');
    expect(result.id).toBe('tx-version-locktime');
  });

  it('informa de la versión y el locktime', () => {
    const result = txVersionLocktime(txWith({ version: 2, locktime: 812_345 }));

    expect(result.details?.['version']).toBe(2);
    expect(result.details?.['locktime']).toBe(812_345);
    expect(result.details?.['usesLocktime']).toBe(true);
  });

  it('locktime 0 → usesLocktime false', () => {
    const result = txVersionLocktime(txWith({ locktime: 0 }));

    expect(result.details?.['usesLocktime']).toBe(false);
  });

  it('detecta RBF opt-in por sequence (BIP-125)', () => {
    const rbf = txVersionLocktime(txWith({ ins: [{ sequence: 0xfffffffd }] }));
    const noRbf = txVersionLocktime(txWith({ ins: [{ sequence: 0xffffffff }] }));

    expect(rbf.details?.['signalsRbf']).toBe(true);
    expect(noRbf.details?.['signalsRbf']).toBe(false);
  });

  it('basta una entrada señalando RBF para que la tx sea reemplazable', () => {
    const result = txVersionLocktime(
      txWith({ ins: [{ sequence: 0xffffffff }, { sequence: 0xfffffffd }] }),
    );

    expect(result.details?.['signalsRbf']).toBe(true);
  });

  it('sequence 0xfffffffe no señala RBF pero habilita locktime', () => {
    const result = txVersionLocktime(txWith({ ins: [{ sequence: 0xfffffffe }] }));

    expect(result.details?.['signalsRbf']).toBe(false);
  });

  it('es pura: no muta la tx de entrada', () => {
    const tx = txWith({ version: 2, locktime: 700_000 });
    const before = structuredClone(tx);

    txVersionLocktime(tx);

    expect(tx).toEqual(before);
  });
});
