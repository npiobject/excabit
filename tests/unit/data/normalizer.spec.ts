import { describe, it, expect } from 'vitest';
import { normalizeTx, normalizeOutspends, applyOutspends } from '@/data/normalizer';
import type { EsploraTx } from '@/data/providers/esplora-types';

import canonical from '@tests/fixtures/mempool/tx-85e72c08.json';
import canonicalOutspends from '@tests/fixtures/mempool/outspends-85e72c08.json';
import coinbase from '@tests/fixtures/mempool/tx-b75ca310.json';
import taproot from '@tests/fixtures/mempool/tx-c2f59c6f.json';
import coinjoin from '@tests/fixtures/mempool/tx-3ddb2ad2.json';
import opReturn from '@tests/fixtures/mempool/tx-fa0e80b4.json';
import mixed from '@tests/fixtures/mempool/tx-1d053e14.json';

const asTx = (raw: unknown) => raw as EsploraTx;

describe('normalizeTx contra fixtures reales', () => {
  it('normaliza 85e72c…4b70f2: fee=10000n, 2 vin con value bigint, 2 vout p2pkh, blockHeight 300000', () => {
    const tx = normalizeTx(asTx(canonical));

    expect(tx.txid).toBe('85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2');
    expect(tx.fee).toBe(10_000n);
    expect(tx.blockHeight).toBe(300000);
    expect(tx.blockTime).toBe(1399703554);
    expect(tx.version).toBe(1);
    expect(tx.locktime).toBe(0);

    expect(tx.vin).toHaveLength(2);
    expect(tx.vin.every((i) => typeof i.value === 'bigint')).toBe(true);

    expect(tx.vout).toHaveLength(2);
    expect(tx.vout.map((o) => o.scriptType)).toEqual(['p2pkh', 'p2pkh']);
  });

  it('la contabilidad cuadra: Σvin − Σvout = fee', () => {
    const tx = normalizeTx(asTx(canonical));
    const totalIn = tx.vin.reduce((acc, i) => acc + i.value, 0n);
    const totalOut = tx.vout.reduce((acc, o) => acc + o.value, 0n);

    expect(totalIn - totalOut).toBe(tx.fee);
  });

  it('vin.value y vout.value son bigint, nunca number', () => {
    const tx = normalizeTx(asTx(canonical));

    for (const vin of tx.vin) expect(typeof vin.value).toBe('bigint');
    for (const vout of tx.vout) expect(typeof vout.value).toBe('bigint');
    expect(typeof tx.fee).toBe('bigint');

    // 500 BTC en sats: el importe real de esta tx, preservado sin pérdida.
    expect(tx.vout[0]?.value).toBe(50_000_000_000n);
  });

  it('conserva el importe máximo posible (21M BTC) sin perder precisión', () => {
    // Todo el suministro de Bitcoin en sats cabe en un double, así que el
    // riesgo no está en un importe suelto sino en SUMARLOS: agregar valores en
    // un grafo grande desborda con facilidad. De ahí bigint en el dominio.
    const max = structuredClone(canonical) as unknown as EsploraTx;
    max.vout[0]!.value = 2_100_000_000_000_000;

    const tx = normalizeTx(max);

    expect(tx.vout[0]?.value).toBe(2_100_000_000_000_000n);
    // La suma de importes grandes sigue siendo exacta, que es lo que importa.
    expect(tx.vout[0]!.value * 1_000_000n).toBe(2_100_000_000_000_000_000_000n);
  });

  it('tx sin confirmar → blockHeight y blockTime null', () => {
    const unconfirmed = structuredClone(canonical) as unknown as EsploraTx;
    unconfirmed.status = { confirmed: false };

    const tx = normalizeTx(unconfirmed);

    expect(tx.blockHeight).toBeNull();
    expect(tx.blockTime).toBeNull();
  });

  it('salida OP_RETURN → address undefined, scriptType unknown', () => {
    const tx = normalizeTx(asTx(opReturn));
    const data = tx.vout[0];

    expect(data?.scriptType).toBe('unknown');
    expect(data?.address).toBeUndefined();
    expect(data?.value).toBe(0n);
    // El resto de salidas sí tienen dirección.
    expect(tx.vout[1]?.address).toBeDefined();
    expect(tx.vout[1]?.scriptType).toBe('p2pkh');
  });

  it('coinbase → vin sin txid previo tratado sin crash', () => {
    const tx = normalizeTx(asTx(coinbase));

    expect(tx.vin).toHaveLength(1);
    const input = tx.vin[0]!;

    expect(input.isCoinbase).toBe(true);
    expect(input.txid).toBeNull();
    expect(input.vout).toBeNull();
    expect(input.value).toBe(0n);
    expect(input.address).toBeUndefined();
    expect(tx.fee).toBe(0n);
  });

  it('mapea los tipos de script de Esplora al enum del dominio', () => {
    expect(normalizeTx(asTx(taproot)).vout.map((o) => o.scriptType)).toEqual(['p2tr', 'p2tr']);
    expect(normalizeTx(asTx(coinjoin)).vout.map((o) => o.scriptType)).toEqual(
      Array<string>(5).fill('p2wpkh'),
    );
    expect(normalizeTx(asTx(mixed)).vout.map((o) => o.scriptType)).toEqual([
      'p2wpkh',
      'p2wpkh',
      'p2pkh',
    ]);
  });

  it('BUG-010: taproot no se confunde con p2wsh pese a compartir longitud', () => {
    const tx = normalizeTx(asTx(taproot));

    expect(tx.vout.every((o) => o.scriptType === 'p2tr')).toBe(true);
    expect(tx.vout.some((o) => o.scriptType === 'p2wsh')).toBe(false);
  });

  it('es puro: no muta la respuesta del provider', () => {
    const raw = structuredClone(canonical);
    const before = JSON.stringify(raw);

    normalizeTx(raw);

    expect(JSON.stringify(raw)).toBe(before);
  });

  it('preserva el orden y el índice n de las salidas', () => {
    const tx = normalizeTx(asTx(coinjoin));

    expect(tx.vout.map((o) => o.n)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('outspends → vout.spent (RF-05: marcar UTXO)', () => {
  it('marca vout.spent y spentBy según outspends', () => {
    const tx = normalizeTx(asTx(canonical));
    const spends = normalizeOutspends(canonicalOutspends);
    const withSpends = applyOutspends(tx, spends);

    expect(withSpends.vout[0]?.spent).toBe(true);
    expect(withSpends.vout[0]?.spentBy).toBe(
      'eef59685a6e3f93663b02d758230220b27d1f7bc2070e49133d53232fdb09577',
    );
    expect(withSpends.vout[1]?.spent).toBe(true);
  });

  it('un output sin gastar queda spent=false y sin spentBy (es un UTXO)', () => {
    const tx = normalizeTx(asTx(canonical));
    const withSpends = applyOutspends(tx, [{ spent: false }, { spent: false }]);

    expect(withSpends.vout[0]?.spent).toBe(false);
    expect(withSpends.vout[0]?.spentBy).toBeUndefined();
  });

  it('sin outspends consultados, spent queda undefined (no se finge saberlo)', () => {
    const tx = normalizeTx(asTx(canonical));

    expect(tx.vout[0]?.spent).toBeUndefined();
  });

  it('applyOutspends es puro: devuelve una tx nueva sin mutar la original', () => {
    const tx = normalizeTx(asTx(canonical));
    const result = applyOutspends(tx, [{ spent: false }, { spent: false }]);

    expect(result).not.toBe(tx);
    expect(tx.vout[0]?.spent).toBeUndefined();
  });

  it('ignora outspends de más y deja intactos los vout sin dato', () => {
    const tx = normalizeTx(asTx(canonical));
    const result = applyOutspends(tx, [{ spent: true, txid: 'a'.repeat(64), vin: 0 }]);

    expect(result.vout[0]?.spent).toBe(true);
    expect(result.vout[1]?.spent).toBeUndefined();
  });
});
