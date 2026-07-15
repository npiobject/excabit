import { describe, it, expect } from 'vitest';
import { unnecessaryInput } from '@/analysis/heuristics/h02-unnecessary-input';
import { txWith } from '@tests/helpers/tx-builder';

describe('H-02 unnecessary-input', () => {
  it('V1: ins [500k, 300k], outs [100k, 650k] → detected', () => {
    const result = unnecessaryInput(
      txWith({
        ins: [{ value: 500_000n }, { value: 300_000n }],
        outs: [{ value: 100_000n }, { value: 650_000n }],
      }),
    );

    expect(result.outcome).toBe('detected');
  });

  it('V2: ins [500k, 300k], outs [400k, 350k] → not-applicable (ninguna salida < 300k)', () => {
    const result = unnecessaryInput(
      txWith({
        ins: [{ value: 500_000n }, { value: 300_000n }],
        outs: [{ value: 400_000n }, { value: 350_000n }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('V3: 1 input → not-applicable', () => {
    const result = unnecessaryInput(
      txWith({ ins: [{ value: 500_000n }], outs: [{ value: 100_000n }, { value: 390_000n }] }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('V4 / BUG-007: ins [500k, 300k], outs [400k, 390k] → not-applicable', () => {
    // El legacy hacía `this.inputs[i].addresses[0].value`: leía `.value` de un
    // string (la dirección) → undefined. Y `undefined < satsOutMin` es siempre
    // false, así que la guarda no cortaba nunca y devolvía true aquí.
    const result = unnecessaryInput(
      txWith({
        ins: [{ value: 500_000n }, { value: 300_000n }],
        outs: [{ value: 400_000n }, { value: 390_000n }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('compara VALORES de los inputs, no propiedades de la dirección (BUG-007)', () => {
    // Si se comparase algo que resulta undefined, este caso daría detected.
    const noDetect = unnecessaryInput(
      txWith({
        ins: [{ value: 10n }, { value: 20n }],
        outs: [{ value: 30_000n }, { value: 40_000n }],
      }),
    );

    expect(noDetect.outcome).toBe('not-applicable');
  });

  it('la salida menor debe ser menor que la ENTRADA menor', () => {
    const result = unnecessaryInput(
      txWith({
        ins: [{ value: 500_000n }, { value: 300_000n }],
        outs: [{ value: 299_999n }, { value: 500_000n }],
      }),
    );

    expect(result.outcome).toBe('detected');
  });

  it('igualdad exacta no cuenta: outs [300k, …] con min(ins)=300k → not-applicable', () => {
    const result = unnecessaryInput(
      txWith({
        ins: [{ value: 500_000n }, { value: 300_000n }],
        outs: [{ value: 300_000n }, { value: 490_000n }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('3 inputs → not-applicable (la precondición es exactamente 2)', () => {
    const result = unnecessaryInput(
      txWith({
        ins: [{ value: 500_000n }, { value: 300_000n }, { value: 200_000n }],
        outs: [{ value: 100_000n }, { value: 850_000n }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('tipos de dirección mezclados → not-applicable', () => {
    const result = unnecessaryInput(
      txWith({
        ins: [
          { value: 500_000n, type: 'p2wpkh' },
          { value: 300_000n, type: 'p2pkh' },
        ],
        outs: [{ value: 100_000n }, { value: 650_000n }],
      }),
    );

    expect(result.outcome).toBe('not-applicable');
  });

  it('su confianza es medium', () => {
    const result = unnecessaryInput(txWith({ ins: [{}, {}] }));

    expect(result.confidence).toBe('medium');
    expect(result.id).toBe('unnecessary-input');
  });

  it('es pura: no muta la tx de entrada', () => {
    const tx = txWith({
      ins: [{ value: 500_000n }, { value: 300_000n }],
      outs: [{ value: 100_000n }, { value: 650_000n }],
    });
    const before = structuredClone(tx);

    unnecessaryInput(tx);

    expect(tx).toEqual(before);
  });

  it('sin direcciones → insufficient-data', () => {
    const result = unnecessaryInput(
      txWith({
        ins: [{ value: 500_000n, address: null }, { value: 300_000n }],
        outs: [{ value: 100_000n }, { value: 650_000n }],
      }),
    );

    expect(result.outcome).toBe('insufficient-data');
  });
});
