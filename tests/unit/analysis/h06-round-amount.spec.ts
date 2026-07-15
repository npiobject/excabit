import { describe, it, expect } from 'vitest';
import { roundAmount } from '@/analysis/heuristics/h06-round-amount';
import { txWith } from '@tests/helpers/tx-builder';

describe('H-06 round-amount', () => {
  it('V1: outs [1_500_000, 73_224_118] → detected (paymentIndex=0)', () => {
    const result = roundAmount(txWith({ outs: [{ value: 1_500_000n }, { value: 73_224_118n }] }));

    expect(result.outcome).toBe('detected');
    expect(result.details?.['paymentIndex']).toBe(0);
  });

  it('V2: outs [123_456, 654_321] → not-applicable (ninguna redonda)', () => {
    const result = roundAmount(txWith({ outs: [{ value: 123_456n }, { value: 654_321n }] }));

    expect(result.outcome).toBe('not-applicable');
  });

  it('V3 / BUG-008: 1 salida no redonda → not-applicable', () => {
    // El legacy tenía `if ((A && B) || C && D)` sin paréntesis en la segunda
    // rama: con lengOut==1 y numOutConCeros==0 evaluaba C&&D sin pretenderlo.
    const result = roundAmount(txWith({ outs: [{ value: 73_224_118n }] }));

    expect(result.outcome).toBe('not-applicable');
  });

  it('V4: outs [1_000_000, 2_000_000] (ambas redondas) → not-applicable', () => {
    const result = roundAmount(txWith({ outs: [{ value: 1_000_000n }, { value: 2_000_000n }] }));

    expect(result.outcome).toBe('not-applicable');
  });

  it('1 sola salida y es redonda → detected', () => {
    const result = roundAmount(txWith({ outs: [{ value: 1_500_000n }] }));

    expect(result.outcome).toBe('detected');
    expect(result.details?.['paymentIndex']).toBe(0);
  });

  it('el umbral es 3 ceros finales: 1_000 es redondo, 1_00 no', () => {
    expect(roundAmount(txWith({ outs: [{ value: 1_000n }, { value: 12_345n }] })).outcome).toBe(
      'detected',
    );
    expect(roundAmount(txWith({ outs: [{ value: 100n }, { value: 12_345n }] })).outcome).toBe(
      'not-applicable',
    );
  });

  it('un valor 0 (OP_RETURN) no se cuenta como pago redondo', () => {
    const result = roundAmount(
      txWith({ outs: [{ value: 0n, address: null }, { value: 12_345n }] }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('con 3 salidas, exactamente una redonda → detected', () => {
    const result = roundAmount(
      txWith({ outs: [{ value: 12_345n }, { value: 2_500_000n }, { value: 98_765n }] }),
    );

    expect(result.outcome).toBe('detected');
    expect(result.details?.['paymentIndex']).toBe(1);
  });

  it('su confianza es low', () => {
    const result = roundAmount(txWith());

    expect(result.confidence).toBe('low');
    expect(result.id).toBe('round-amount');
  });

  it('es pura: no muta la tx de entrada', () => {
    const tx = txWith({ outs: [{ value: 1_500_000n }, { value: 73_224_118n }] });
    const before = structuredClone(tx);

    roundAmount(tx);

    expect(tx).toEqual(before);
  });
});
