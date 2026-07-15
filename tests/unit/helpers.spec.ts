import { describe, it, expect } from 'vitest';
import { txFixture, VALID_TXID } from '@tests/helpers/tx-fixture';

describe('txFixture', () => {
  it('crea una tx válida por defecto', () => {
    const tx = txFixture();

    expect(tx.txid).toBe(VALID_TXID);
    expect(tx.txid).toMatch(/^[0-9a-f]{64}$/);
    expect(tx.vin.length).toBeGreaterThan(0);
    expect(tx.vout.length).toBeGreaterThan(0);
    expect(typeof tx.fee).toBe('bigint');
    expect(tx.vin.every((i) => typeof i.value === 'bigint')).toBe(true);
    expect(tx.vout.every((o) => typeof o.value === 'bigint')).toBe(true);
  });

  it('la tx por defecto cuadra: Σvin − Σvout = fee', () => {
    const tx = txFixture();
    const totalIn = tx.vin.reduce((acc, i) => acc + i.value, 0n);
    const totalOut = tx.vout.reduce((acc, o) => acc + o.value, 0n);

    expect(totalIn - totalOut).toBe(tx.fee);
  });

  it('aplica overrides profundos sin mutar la base', () => {
    const before = txFixture();

    const custom = txFixture({
      blockHeight: null,
      blockTime: null,
      vout: [{ n: 0, value: 42n, scriptType: 'p2tr' }],
    });

    expect(custom.blockHeight).toBeNull();
    expect(custom.vout).toHaveLength(1);
    expect(custom.vout[0]?.value).toBe(42n);
    // Los campos no sobrescritos conservan el valor por defecto.
    expect(custom.txid).toBe(VALID_TXID);

    // La base sigue intacta: un test no puede contaminar al siguiente.
    const after = txFixture();
    expect(after).toEqual(before);
    expect(after.vout).toHaveLength(before.vout.length);
  });

  it('cada llamada devuelve objetos anidados independientes', () => {
    const a = txFixture();
    const b = txFixture();

    expect(a.vin).not.toBe(b.vin);
    expect(a.vin[0]).not.toBe(b.vin[0]);

    a.vin[0]!.value = 999n;
    expect(b.vin[0]!.value).not.toBe(999n);
  });
});
