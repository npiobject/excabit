import { describe, it, expect } from 'vitest';
import {
  addressTypeOf,
  typesOfInputs,
  typesOfOutputs,
  allSameType,
  hasKnownAddresses,
} from '@/analysis/address-type';
import { classifyAddress } from '@/core/validators';
import { txWith } from '@tests/helpers/tx-builder';

describe('BUG-006 — un único clasificador', () => {
  it('addressTypeOf ES el clasificador de core: no hay un segundo', () => {
    // La raíz del BUG-006 fue tener dos funciones que devolvían tipos
    // incompatibles (números 1/2/3 vs strings 'bc1q'/'bc1p'/0) y compararlas
    // entre sí. La defensa no es "clasificar mejor": es no duplicar.
    expect(addressTypeOf).toBe(classifyAddress);
  });

  it('devuelve un único enum tipado para cada tipo de dirección', () => {
    expect(addressTypeOf('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe('p2pkh');
    expect(addressTypeOf('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe('p2sh');
    expect(addressTypeOf('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe('p2wpkh');
    expect(addressTypeOf('bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3')).toBe(
      'p2wsh',
    );
    expect(addressTypeOf('bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr')).toBe(
      'p2tr',
    );
  });

  it('dirección inválida → unknown', () => {
    expect(addressTypeOf('basura')).toBe('unknown');
    expect(addressTypeOf('')).toBe('unknown');
  });
});

describe('tipos de entradas y salidas', () => {
  it('lee el tipo del vin/vout, que viene del proveedor', () => {
    const tx = txWith({
      ins: [{ type: 'p2tr' }, { type: 'p2wpkh' }],
      outs: [{ type: 'p2pkh' }],
    });

    expect(typesOfInputs(tx)).toEqual(['p2tr', 'p2wpkh']);
    expect(typesOfOutputs(tx)).toEqual(['p2pkh']);
  });

  it('funciona en testnet, donde clasificar por la cadena daría unknown', () => {
    // El tipo lo da el proveedor; la dirección puede ser de cualquier red.
    const tx = txWith({ ins: [{ type: 'p2wpkh', address: 'tb1qexample' }] });

    expect(typesOfInputs(tx)).toEqual(['p2wpkh']);
    expect(addressTypeOf('tb1qexample')).toBe('unknown');
  });
});

describe('allSameType', () => {
  it('true si todos comparten tipo', () => {
    expect(allSameType(['p2wpkh', 'p2wpkh', 'p2wpkh'])).toBe(true);
  });

  it('false si hay mezcla', () => {
    expect(allSameType(['p2wpkh', 'p2pkh'])).toBe(false);
  });

  it('un solo elemento siempre es homogéneo', () => {
    expect(allSameType(['p2tr'])).toBe(true);
  });

  it('lista vacía → false (no hay nada que comparar, no se afirma)', () => {
    expect(allSameType([])).toBe(false);
  });

  it('unknown no cuenta como un tipo válido para afirmar homogeneidad', () => {
    expect(allSameType(['unknown', 'unknown'])).toBe(false);
    expect(allSameType(['p2pkh', 'unknown'])).toBe(false);
  });
});

describe('hasKnownAddresses', () => {
  it('true si toda entrada y salida tiene dirección', () => {
    expect(hasKnownAddresses(txWith())).toBe(true);
  });

  it('false si alguna salida no tiene dirección (OP_RETURN)', () => {
    expect(hasKnownAddresses(txWith({ outs: [{}, { address: null }] }))).toBe(false);
  });

  it('false si alguna entrada no tiene dirección', () => {
    expect(hasKnownAddresses(txWith({ ins: [{ address: null }] }))).toBe(false);
  });
});
