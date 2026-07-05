---
documento: Glosario
proyecto: excabit v2
estado: borrador
version: 0.1
fecha: 2026-07-04
---

# Glosario

Términos usados en excabit y en estos documentos, explicados para un público no experto.

**Transacción (Tx)** — Registro en la blockchain que gasta unas monedas (entradas) y crea otras nuevas (salidas). Se identifica por su **txid** (64 caracteres hexadecimales).

**Entrada (input / vin)** — Referencia a una salida anterior que se está gastando. Toda entrada fue antes la salida de otra transacción: por eso las transacciones forman un grafo.

**Salida (output / vout)** — Cantidad de bitcoin asignada a una dirección (o script). Puede estar gastada (otra tx la usó como entrada) o sin gastar.

**UTXO** (*Unspent Transaction Output*) — Salida aún no gastada. El conjunto de UTXOs es "el saldo" de la red. En excabit se dibujan como nodos diamante azules.

**Dirección** — Codificación del script que puede gastar una salida. Tipos que distingue excabit:
- **P2PKH** (`1…`, base58): formato original.
- **P2SH** (`3…`, base58): scripts, típicamente multifirma o SegWit envuelto.
- **P2WPKH** (`bc1q…`, 42 caracteres, bech32): SegWit nativo.
- **P2WSH** (`bc1q…`, 62 caracteres, bech32): scripts SegWit.
- **P2TR** (`bc1p…`, bech32m): **Taproot**, el formato más reciente.

**Cambio (change)** — Como las salidas no se pueden gastar parcialmente, quien paga suele enviarse a sí mismo "la vuelta" en una salida nueva. Identificar cuál de las salidas es el cambio es el objetivo de la mayoría de heurísticas.

**Heurística** — Regla que estima algo probable pero no seguro (por eso cada una lleva un nivel de confianza en excabit). Ver [04-heuristicas-privacidad.md](04-heuristicas-privacidad.md).

**CIOH** (*Common Input Ownership Heuristic*) — "Todas las entradas de una tx pertenecen al mismo dueño" (salvo CoinJoin). Es la base del **clustering**: agrupar direcciones que probablemente comparten propietario.

**CoinJoin** — Transacción colaborativa entre varios usuarios con muchas salidas de igual importe, diseñada para romper las heurísticas anteriores.

**Peel chain** — Cadena de transacciones que va "pelando" pequeñas cantidades de un monto grande, patrón típico de movimientos de fondos que quieren pasar desapercibidos.

**Taint / seguimiento de fondos** — Rastrear qué salidas descienden de una moneda concreta a través del grafo.

**Fee / feerate** — Comisión pagada al minero (entradas − salidas), absoluta (sats) o por peso (sat/vB).

**Locktime / versión / sequence (RBF)** — Campos técnicos de la tx que delatan qué software de cartera la creó (*fingerprinting*).

**Satoshi (sat)** — 1/100.000.000 de bitcoin. excabit calcula internamente siempre en sats.

**mempool.space / Esplora** — Explorador público de Bitcoin y su API (Esplora). Es el proveedor único de datos de excabit v2, sin clave API; cualquiera puede autohospedarlo y apuntar la app a su propio nodo.

**Investigación** — En excabit, el conjunto de: grafo expandido, posiciones, etiquetas, colores y notas; se guarda como fichero `.excabit.json`.

**SDD / TDD** — *Spec-Driven* y *Test-Driven Development*: primero se escribe la especificación (docs 03-05) y los tests (doc 07), después el código.
