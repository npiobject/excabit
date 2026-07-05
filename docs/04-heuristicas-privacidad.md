---
documento: Especificación de heurísticas de privacidad
proyecto: excabit v2
estado: borrador
version: 0.1
fecha: 2026-07-04
---

# 04 — Heurísticas de privacidad

Especificación formal de las heurísticas de análisis de cadena que excabit v2 evalúa por transacción. Cada una se implementará como **función pura** `(tx: NormalizedTx) => HeuristicResult` (corrige BUG-011) y se desarrollará en TDD: primero los vectores de test de este documento, después el código.

```ts
interface HeuristicResult {
  id: HeuristicId;
  outcome: 'detected' | 'not-applicable' | 'insufficient-data';
  confidence: 'high' | 'medium' | 'low';   // fija por heurística, ver tabla
  details?: Record<string, unknown>;        // p.ej. índice del output de cambio
}
```

## Convenciones

- **Tipo de dirección**: clasificación única en `analysis/address-type.ts` (corrige BUG-006):
  `p2pkh` (base58 `1…`), `p2sh` (base58 `3…`), `p2wpkh` (bech32 `bc1q…`, 42 chars), `p2wsh` (bech32 `bc1q…`, 62 chars), `p2tr` (bech32m `bc1p…`, 62 chars), `unknown`.
- "Mismo tipo" significa igualdad de ese enum, nunca mezclar clasificadores.
- Importes en satoshis como `bigint`.

## H-01 `change-largest-output` — Salida de monto mayor (cambio probable)

Idea: en un pago típico 1-entrada/2-salidas donde todas las direcciones son del mismo tipo, si una salida es mucho mayor que la otra (min < 10% de max), la mayor suele ser el cambio.

- Precondiciones: exactamente 1 input y 2 outputs, todos con dirección conocida y del mismo tipo. Si no → `not-applicable`.
- Algoritmo: `detected` si `min(out) < max(out) * 0.1`; `details.changeIndex` = índice de la salida mayor. Confianza: **low** (es la heurística más débil).
- Legacy: `salidaMontoMayor` ([heuristic.js:36](../old/clases/heuristic.js), afectada por BUG-006).

Vectores de test:

| Caso | Entrada | Esperado |
|---|---|---|
| V1 | 1 in p2wpkh, outs [1_000_000, 50_000] p2wpkh | detected, changeIndex=0 |
| V2 | 1 in, outs [1_000_000, 900_000] mismo tipo | not-applicable (ratio) |
| V3 | 2 inputs | not-applicable |
| V4 | 1 in p2pkh, outs p2wpkh+p2pkh (tipos mezclados) | not-applicable |
| V5 | 1 in, 2 outs, un output sin dirección (OP_RETURN) | insufficient-data |

## H-02 `unnecessary-input` — Entrada innecesaria

Idea: si con 2 entradas existe una salida menor que cualquiera de las entradas, una de las entradas era "innecesaria" para ese pago → la salida menor es probablemente el pago y la mayor el cambio.

- Precondiciones: exactamente 2 inputs, ≥ 2 outputs, mismos tipos de dirección. 
- Algoritmo: `detected` si `min(outputs) < min(inputs)` (comparar **valores de los inputs**, `vin[i].value` — el legacy comparaba `undefined`, BUG-007). Confianza: **medium**.
- Legacy: `entradaInnecesaria` ([heuristic.js:101](../old/clases/heuristic.js)).

Vectores: V1 ins [500k, 300k], outs [100k, 650k] → detected. V2 ins [500k, 300k], outs [400k, 350k] → not-applicable (ninguna salida < 300k). V3 1 input → not-applicable. **V4 (regresión BUG-007)**: ins [500k, 300k], outs [400k, 390k] → not-applicable (el legacy devolvía true).

## H-03 `script-type-mismatch` — Pago a script distinto (bech32 42/62)

Idea: con 1 input bc1q y 2 salidas bc1q, si el input y una salida son de 62 chars (p2wsh) y la otra de 42 (p2wpkh) — o viceversa — la salida que coincide en longitud con el input es probablemente el cambio.

- Precondiciones: 1 input y 2 outputs, todos `bc1q…` con longitudes 42 o 62. Longitudes fuera de {42,62} → `insufficient-data` (el legacy hacía console.log, BUG-010).
- Confianza: **medium**. Legacy: `pagoADirScripDif` (afectada por precedencia de paréntesis en su condición final — cubierta por vectores).

Vectores: V1 in 62, outs [62, 42] → detected (change = la de 62). V2 in 42, outs [42, 42] → not-applicable. V3 outs con bc1p → not-applicable (es H-04).

## H-04 `taproot-payment` — Pago usando Taproot

Idea: si todas las entradas son `bc1p` (p2tr) y las salidas son todas `bc1q` menos exactamente una `bc1p`, la salida taproot es probablemente el cambio (el pagador usa taproot; el receptor aún no).

- Precondiciones: ≥1 input, ≥2 outputs con dirección. Confianza: **medium**.
- Legacy: `pagoUsandoTaproot` ([heuristic.js:213](../old/clases/heuristic.js)) — lógica correcta, se conserva.

Vectores: V1 ins todos bc1p, outs [bc1q, bc1q, bc1p] → detected. V2 outs [bc1p, bc1p] → not-applicable. V3 ins mezcla bc1p/bc1q → not-applicable.

## H-05 `format-change` — Pago a formato diferente

Idea: si todas las entradas son del mismo tipo y entre las salidas exactamente una es de tipo distinto al de las entradas, esa salida distinta es probablemente el **pago** (y las del mismo tipo, el cambio).

- Precondiciones: todas las entradas del mismo tipo; ≥ 2 outputs. Confianza: **medium**.
- Legacy: `pagoFormatoDiferente` ([heuristic.js:278](../old/clases/heuristic.js)).

Vectores: V1 ins p2wpkh, outs [p2wpkh, p2pkh] → detected (pago = p2pkh). V2 outs [p2pkh, p2sh] con ins p2wpkh (2 tipos distintos) → not-applicable. V3 1 output → not-applicable.

## H-06 `round-amount` — Pago con número redondo

Idea: los humanos pagan cantidades redondas; el cambio nunca es redondo. Salidas con ≥ 3 ceros finales en sats sugieren cuál es el pago.

- Algoritmo: contar ceros decimales finales de cada `out.value`; `detected` si (1 salida y es redonda) o (N salidas y ≥ N−1 son redondas es demasiado laxo — v2 usa: exactamente una salida redonda y el resto no) → `details.paymentIndex`. Confianza: **low**.
- Legacy: `pagoNumeroRedondo` ([heuristic.js:348](../old/clases/heuristic.js), BUG-008 de precedencia).

Vectores: V1 outs [1_500_000, 73_224_118] → detected (paymentIndex=0). V2 outs [123_456, 654_321] → not-applicable. **V3 (regresión BUG-008)**: 1 salida no redonda → not-applicable. V4 outs [1_000_000, 2_000_000] (ambas redondas) → not-applicable.

## H-07 `address-reuse` — Reutilización de direcciones

Idea: si una dirección de entrada aparece también como salida, esa salida es el cambio con certeza casi total (self-transfer / mala praxis de la wallet).

- Precondiciones: ≥1 input con dirección. Se evalúa sobre **todas** las combinaciones input×output (el legacy solo con 1-in/2-out). Confianza: **high**.
- Legacy: `reutilizaDirecciones` ([heuristic.js:381](../old/clases/heuristic.js)).

Vectores: V1 in A, outs [A, B] → detected (change=0). V2 ins [A,C], outs [B, C] → detected. V3 sin coincidencias → not-applicable.

## H-08 `tx-version-locktime` — Versión y locktime (nueva; sustituye al stub BUG-009)

Idea: `version` (1/2) y `locktime` ≠ 0 son huellas de software de wallet (fingerprinting): si las salidas gastadas después difieren en huella, se puede distinguir pago de cambio. En v1 de excabit se limita a **informar** la huella (versión, locktime, uso de RBF por sequence) sin veredicto.

- Outcome: siempre `not-applicable` como heurística de cambio; `details` con la huella. Confianza: n/a (informativa).

## H-09 `common-input-ownership` — Propiedad común de entradas (clustering, RF-19)

Idea (CIOH): todas las entradas de una Tx pertenecen presumiblemente al mismo propietario (salvo CoinJoin). Base del clustering de direcciones.

- Precondición: la Tx no parece CoinJoin (nº de salidas de igual importe < umbral). Confianza: **high** cuando aplica.
- Vectores: V1 tx 3 inputs normales → cluster {A,B,C}. V2 tx con 5 salidas idénticas de 0.1 BTC (CoinJoin-like) → not-applicable.

## Score agregado por Tx

`privacyScore = 100 − Σ penalización(heurística detectada)`, ponderando por confianza (high 25, medium 15, low 8; cap a 0). Se muestra como badge de color en el nodo (verde ≥ 80, ámbar 40–79, rojo < 40). Vectores en `07-plan-de-tests.md`.

## Fixtures reales

Para los tests de integración se congelarán como fixtures JSON las respuestas de mempool.space de estas Txs (semillas del legacy):

- `85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2` (ejemplo por defecto del legacy)
- `993ced02486f9aaa5a5ed943141e05e436aac054dcea78a560f0f1860c80415a`
- `1d053e14643494a05e9a4279c42ec9f8924d52100e2e229c5e0174742d50e912`
- `aaeb5265d04d7c89c584a5ecb8dd95cb4ab7773ba6d27eaaff7e08a08f8d530b` (de `old/clases/txs`)
- Más una tx taproot y una CoinJoin conocidas, a seleccionar al crear los fixtures (Fase 1).

## Referencias

- Bitcoin Privacy Wiki — Change address detection heuristics (en.bitcoin.it/wiki/Privacy)
- Meiklejohn et al., *A Fistful of Bitcoins* (CIOH)
- 0xB10C y LaurentMT sobre fingerprinting de wallets (versión/locktime/RBF)
