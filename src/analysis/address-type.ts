/**
 * Tipo de dirección para el análisis (docs/04 §Convenciones).
 *
 * **BUG-006**: el legacy tenía dos clasificadores incompatibles —
 * `tipoDeDireccion()` devolvía números (1/2/3) y `tipoDirecBc1()` devolvía
 * strings ('bc1q'/'bc1p') o el número 0— y comparaba entre sí sus resultados
 * en guardas del tipo `(a != x) && (a != y)`. La guarda "todas las direcciones
 * del mismo tipo" aceptaba y rechazaba combinaciones a capricho.
 *
 * La lección no es "clasificar mejor", es **no duplicar el clasificador**: por
 * eso este módulo reexporta el de `core/validators` en lugar de tener el suyo,
 * y añade solo los helpers que el análisis necesita.
 *
 * Nota: para una tx ya normalizada, el tipo NO se deduce de la dirección: lo da
 * el proveedor en `vin.scriptType`/`vout.scriptType`, que además es correcto en
 * cualquier red. `addressTypeOf` es para clasificar una dirección suelta.
 */
import type { AddressType, NormalizedTx } from '@/core/types';
import { classifyAddress } from '@/core/validators';

/** El clasificador único del proyecto. Mismo enum en toda la app. */
export const addressTypeOf = classifyAddress;

export function typesOfInputs(tx: NormalizedTx): AddressType[] {
  return tx.vin.map((vin) => vin.scriptType);
}

export function typesOfOutputs(tx: NormalizedTx): AddressType[] {
  return tx.vout.map((vout) => vout.scriptType);
}

/**
 * ¿Son todos el mismo tipo *conocido*?
 *
 * Una lista vacía o con `unknown` devuelve `false`: no se puede afirmar que
 * varias direcciones comparten tipo cuando no sabemos cuál es. Afirmarlo era
 * justo lo que hacía el legacy al comparar clasificadores distintos.
 */
export function allSameType(types: readonly AddressType[]): boolean {
  const first = types[0];
  if (first === undefined || first === 'unknown') return false;

  return types.every((type) => type === first);
}

/** ¿Toda entrada y salida tiene dirección conocida? */
export function hasKnownAddresses(tx: NormalizedTx): boolean {
  return (
    tx.vin.every((vin) => vin.address !== undefined) &&
    tx.vout.every((vout) => vout.address !== undefined)
  );
}
