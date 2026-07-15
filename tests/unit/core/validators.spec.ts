import { describe, it, expect } from 'vitest';
import { normalizeTxid, isValidTxid, classifyAddress, detectSearchKind } from '@/core/validators';
import { VALID_TXID } from '@tests/helpers/tx-fixture';

describe('RF-01 txid', () => {
  it('acepta 64 hex en minúsculas', () => {
    expect(isValidTxid(VALID_TXID)).toBe(true);
    expect(normalizeTxid(VALID_TXID)).toBe(VALID_TXID);
  });

  it('acepta 64 hex en mayúsculas y normaliza a minúsculas', () => {
    const upper = VALID_TXID.toUpperCase();

    expect(isValidTxid(upper)).toBe(true);
    expect(normalizeTxid(upper)).toBe(VALID_TXID);
  });

  it('hace trim de la entrada (pegar desde el portapapeles arrastra espacios)', () => {
    expect(normalizeTxid(`  ${VALID_TXID}\n`)).toBe(VALID_TXID);
    expect(isValidTxid(` ${VALID_TXID} `)).toBe(true);
  });

  it('rechaza 63 caracteres', () => {
    expect(isValidTxid(VALID_TXID.slice(0, 63))).toBe(false);
    expect(normalizeTxid(VALID_TXID.slice(0, 63))).toBeNull();
  });

  it('rechaza 65 caracteres', () => {
    expect(isValidTxid(VALID_TXID + 'a')).toBe(false);
  });

  it('rechaza caracteres no hex', () => {
    expect(isValidTxid('z'.repeat(64))).toBe(false);
    expect(isValidTxid(VALID_TXID.slice(0, 63) + 'g')).toBe(false);
  });

  it('rechaza espacios internos', () => {
    const withSpace = VALID_TXID.slice(0, 32) + ' ' + VALID_TXID.slice(33);

    expect(withSpace).toHaveLength(64);
    expect(isValidTxid(withSpace)).toBe(false);
  });

  it('rechaza cadena vacía y prefijo 0x', () => {
    expect(isValidTxid('')).toBe(false);
    expect(isValidTxid('   ')).toBe(false);
    expect(isValidTxid('0x' + VALID_TXID.slice(2))).toBe(false);
  });
});

describe('RF-02 clasificador de direcciones', () => {
  it('detecta p2pkh (1…)', () => {
    expect(classifyAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe('p2pkh');
  });

  it('detecta p2sh (3…)', () => {
    expect(classifyAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe('p2sh');
  });

  it('detecta p2wpkh (bech32 v0 de 42 caracteres)', () => {
    const addr = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

    expect(addr).toHaveLength(42);
    expect(classifyAddress(addr)).toBe('p2wpkh');
  });

  it('detecta p2wsh (bech32 v0 de 62 caracteres)', () => {
    const addr = 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3';

    expect(addr).toHaveLength(62);
    expect(classifyAddress(addr)).toBe('p2wsh');
  });

  it('detecta p2tr (bech32m v1, bc1p… de 62 caracteres)', () => {
    const addr = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';

    expect(addr).toHaveLength(62);
    expect(classifyAddress(addr)).toBe('p2tr');
  });

  it('BUG-010: bc1p de 62 caracteres es taproot, no p2wsh (el legacy lo confundía por longitud)', () => {
    const p2wsh = 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3';
    const p2tr = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';

    expect(p2wsh).toHaveLength(p2tr.length);
    expect(classifyAddress(p2wsh)).not.toBe(classifyAddress(p2tr));
  });

  it('acepta bech32 en mayúsculas (BIP-173 lo permite si es uniforme)', () => {
    expect(classifyAddress('BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4')).toBe('p2wpkh');
  });

  it('rechaza bech32 con mezcla de mayúsculas y minúsculas', () => {
    expect(classifyAddress('bc1QW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe('unknown');
  });

  it('cadena vacía → unknown', () => {
    expect(classifyAddress('')).toBe('unknown');
    expect(classifyAddress('   ')).toBe('unknown');
  });

  it('BUG-006: devuelve siempre un único enum tipado, nunca número ni string suelto', () => {
    const valid = ['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr', 'unknown'];
    const inputs = [
      '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
      'basura',
      '',
    ];

    for (const input of inputs) {
      const result = classifyAddress(input);
      expect(typeof result).toBe('string');
      expect(valid).toContain(result);
    }
  });

  it('rechaza base58 con caracteres ambiguos (0, O, I, l)', () => {
    expect(classifyAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN0')).toBe('unknown');
    expect(classifyAddress('1IvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe('unknown');
  });

  it('rechaza base58 fuera de rango de longitud', () => {
    expect(classifyAddress('1abc')).toBe('unknown');
    expect(classifyAddress('1' + 'a'.repeat(60))).toBe('unknown');
  });

  it('rechaza bech32 con carácter fuera del alfabeto (b, i, o, 1)', () => {
    expect(classifyAddress('bc1qb508d6qejxtdg4y5r3zarvary0c5xw7kv8f3tb')).toBe('unknown');
  });
});

describe('RF-02 detección del tipo de búsqueda', () => {
  it('un txid se detecta como txid', () => {
    expect(detectSearchKind(VALID_TXID)).toBe('txid');
    expect(detectSearchKind(` ${VALID_TXID.toUpperCase()} `)).toBe('txid');
  });

  it('una dirección se detecta como address', () => {
    expect(detectSearchKind('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe('address');
    expect(detectSearchKind('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe('address');
  });

  it('lo que no es ni txid ni dirección es invalid (error inline, sin popup)', () => {
    expect(detectSearchKind('hola mundo')).toBe('invalid');
    expect(detectSearchKind('')).toBe('invalid');
  });
});
