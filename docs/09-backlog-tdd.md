---
documento: Backlog TDD — suites y casos en orden de escritura
proyecto: excabit v2
estado: borrador
version: 0.1
fecha: 2026-07-05
---

# 09 — Backlog TDD

Desglose operativo de [07-plan-de-tests.md](07-plan-de-tests.md): **qué ficheros de test se escriben, con qué casos y en qué orden**. Cada caso se escribe ANTES que el código que lo hace pasar (rojo → verde → refactor). Los `describe` llevan el ID trazable (`RF-XX`, `H-XX`, `BUG-XXX`).

Convenciones:
- `tests/unit/**` (Vitest, Node puro), `tests/integration/**` (Vitest+MSW / fake-indexeddb), `tests/e2e/**` (Playwright), `tests/fixtures/**` (JSON congelados), `tests/helpers/` (builders).
- Builder central `txFixture(overrides)` → `NormalizedTx` sintética mínima válida. Es lo PRIMERO que se escribe.
- Un PR = una suite en verde. No se mezclan suites a medio hacer.

---

## Fase 1 — Dominio + datos

Orden de escritura (cada punto es una sesión TDD):

### 1. `tests/helpers/tx-fixture.ts` + `tests/unit/helpers.spec.ts`
- `it('crea una tx válida por defecto')`
- `it('aplica overrides profundos sin mutar la base')`

### 2. `tests/unit/core/validators.spec.ts` — RF-01/RF-02
- `describe('RF-01 txid')`: acepta 64 hex (mayús/minús) · rechaza 63/65 chars, no-hex, con espacios · trim de entrada
- `describe('RF-02 clasificador')`: detecta `1…` p2pkh · `3…` p2sh · `bc1q` 42 · `bc1q` 62 · `bc1p` · rechaza bech32 con mezcla de mayúsculas · cadena vacía → `invalid`

### 3. `tests/unit/data/normalizer.spec.ts` — contra fixtures reales
- `it('normaliza 85e72c…4b70f2: fee=10000n, 2 vin con value bigint, 2 vout p2pkh, blockHeight 300000')`
- `it('vin.value y vout.value son bigint, nunca number')` (los importes > 2^53 existen)
- `it('tx sin confirmar → blockHeight y blockTime null')`
- `it('salida OP_RETURN → address undefined, scriptType unknown')`
- `it('coinbase → vin sin txid previo tratado sin crash')`
- `it('marca vout.spent según outspends')`

### 4. `tests/unit/data/cache.spec.ts` — BUG-002/004
- `describe('BUG-002')`: `it('lo cacheado nunca es thenable')` · `it('dos gets concurrentes de la misma tx → un solo fetch')`
- TTL: tx confirmada no expira · tx sin confirmar expira a 30 s (fake timers) · dirección expira a 30 s
- LRU: al superar 500 entradas expulsa la menos usada

### 5. `tests/unit/data/rate-limiter.spec.ts` — RNF-04 (fake timers)
- respeta N peticiones/segundo · encola el exceso en orden FIFO · backoff exponencial con jitter tras 429 · la cola se vacía al recuperarse

### 6. `tests/integration/api-client.spec.ts` — MSW, RF-04/RF-29, BUG-003
- 200 → NormalizedTx · 404 → `ApiError{kind:'not-found'}` · 429 → `rate-limited` y reintenta · caída de red → 3 reintentos y `network` · **nunca lanza `alert` ni trata un error como dato (regresión BUG-003)**
- `describe('RF-04')`: mainnet `/api/tx/…` · testnet `/testnet/api/tx/…` · signet · URL base autohospedada configurable (ADR-002)

### 7. `tests/unit/core/store.spec.ts`
- mutación solo vía comandos · emite evento tipado por cambio · dos suscriptores reciben el mismo estado · `getState()` es inmutable (freeze en dev)

**Gate de fase**: cobertura `core/`+`data/` ≥ 90 %; `regression/bug-002` y `bug-003` en verde.

---

## Fase 2 — Heurísticas (los vectores YA están escritos en [04-heuristicas-privacidad.md](04-heuristicas-privacidad.md))

### 8. `tests/unit/analysis/address-type.spec.ts` — BUG-006
- un `it` por tipo (p2pkh, p2sh, p2wpkh 42, p2wsh 62, p2tr) · `it('BUG-006: el resultado es un único enum, jamás número y string mezclados')` · dirección inválida → `unknown`

### 9-17. Una suite por heurística: `h01-change-largest-output.spec.ts` … `h09-common-input-ownership.spec.ts`
- Cada `it()` = un vector Vn del doc 04, con su mismo nombre (`it('V4/BUG-007: input menor que min(outputs) → not-applicable')`).
- Además, en todas: `it('es pura: no muta la tx de entrada')` y `it('sin direcciones → insufficient-data')`.

### 18. `tests/unit/analysis/score.spec.ts`
- 0 detectadas → 100 · high=25/medium=15/low=8 · nunca < 0 · umbrales de badge (≥80 verde, 40-79 ámbar, <40 rojo) · la tx real 85e72c… → **60** (ámbar)

> **Corregido en Fase 2 (2026-07-15).** Este documento predecía 52 para `85e72c…`; el valor real aplicando el doc 04 es **60**. La tx solo dispara `address-reuse` (high, −25) y `unnecessary-input` (medium, −15). El 52 asumía además una heurística *low*, y ninguna aplica: H-01 exige exactamente 1 entrada (la tx tiene 2) y H-06 se descarta porque **ambas** salidas son redondas (50.000.000.000 y 3.399.980.000 sats), que es literalmente su vector V4. Verificado contra el fixture real, no estimado.

**Gate**: vectores completos; regresiones BUG-006/007/008 en verde; `analysis/` ≥ 95 %.

---

## Fase 3 — Grafo, comandos y undo

### 19. `tests/unit/core/commands.spec.ts`
- por CADA comando (AddTxData, MoveNode, SetLabel, SetColor, SetNote, DeleteSelection, GroupCluster): `it('do() produce el efecto')` + `it('undo() restaura el estado EXACTO anterior (deep-equal)')`
- `describe('RF-06')`: `it('AddTxData dos veces con la misma tx no duplica nodos ni aristas')`
- `describe('RF-12')`: `it('DeleteSelection elimina aristas huérfanas')` + undo las restaura

### 20. `tests/unit/core/undo.spec.ts` — RF-28, BUG-013 (property-based con fast-check)
- `it('propiedad: N comandos aleatorios + N undos ⇒ estado inicial (deep-equal)')`
- `it('propiedad: undo×k + redo×k ⇒ mismo estado que antes de deshacer')`
- pila limitada a 200 · coalescing: un drag continuo = 1 comando · `it('BUG-013: 100 ciclos no retienen referencias (heap estable)')`

### 21. `tests/unit/graph/layout-radial.spec.ts` — RF-05
- tx raíz en el centro · inputs en semiplano izquierdo, outputs en derecho · N satélites equiespaciados · nodos ya movidos por el usuario NO se recolocan al expandir

### 22-24. E2E `tests/e2e/explore.spec.ts`, `zoom.spec.ts`, `selection.spec.ts`
- explore: buscar → grafo visible → doble click expande → drag → Ctrl+Z revierte DATOS (no píxeles)
- zoom (BUG-015): 20 ruedas adelante y atrás → posiciones del modelo idénticas (sin deriva)
- selection: shift+click acumula · shift+drag área · Esc limpia

**Gate**: paridad F-05..F-17 del legacy; RNF-01 (60 fps / 300 nodos, medición laxa en CI).

---

## Fase 4 — Shell UI

### 25. `tests/unit/ui/shortcuts.spec.ts` — RF-26/27
- `it('no hay dos acciones con el mismo atajo')` · `it('toda acción registrada tiene i18nKey e icono')` · `it('el overlay ? lista exactamente las acciones registradas')`

### 26. `tests/unit/i18n.spec.ts` — RF-30
- `it('es.json y en.json tienen exactamente las mismas claves')` · `it('ninguna clave usada en código falta en los json')` (scan estático)

### 27. E2E `palette.spec.ts`, `panel.spec.ts`, `tour.spec.ts`, `a11y.spec.ts`
- palette: Ctrl+K abre · filtra · Enter ejecuta · **al cerrar devuelve el foco (bug encontrado en el mock)**
- panel: pestañas · colapsar/expandir por botón, `]` y palette (comportamiento validado en el mock)
- tour (RF-32): aparece solo en primer arranque
- a11y: axe-core sin violaciones serias · foco visible · navegación por teclado del panel

**Gate**: screenshots Playwright ≈ mock aprobado; RF-26 completo.

---

## Fase 5 — Persistencia y export

### 28. `tests/unit/persistence/investigation.spec.ts` — RF-21, BUG-019
- round-trip: save → load → deep-equal (incluye bigint serializado como string)
- `describe('migrador legacy')`: `it('migra tests/fixtures/legacy-save.json a schema v2')` · `it('descarta sombra/rayado con aviso')` · `it('schemaVersion desconocida → error claro, no crash')`
- `describe('BUG-019')`: JSON arbitrario/campos faltantes → rechazo con mensaje, jamás estado corrupto

### 29. `tests/integration/autosave.spec.ts` (fake-indexeddb) — RF-22
- guarda tras cada comando (debounced) · al arrancar ofrece restaurar · restaurar ≡ round-trip

### 30. E2E `export.spec.ts` — RF-23/24
- PNG y SVG descargados no vacíos y con dimensiones correctas · CSV con cabecera y una fila por nodo/arista

---

## Fase 6 — Diferenciales (spec → vectores → código, por feature)

- `taint.spec.ts` (RF-18): suma acumulada correcta en grafo sintético en diamante · hops contados · no cruza ramas no conectadas
- `clustering.spec.ts` (RF-19): vectores V1/V2 de H-09 · compound node nombrable · deshacer agrupación
- `pagination.spec.ts` (RF-31): dirección con 5.000 txs → 25 + cursor · UI nunca bloqueada (E2E)
- RF-20/33/34: los casos se redactan al especificar cada feature (mismo método).

---

## Resumen de esfuerzo

| Fase | Suites | Casos aprox. |
|---|---|---|
| F1 datos | 7 | ~45 |
| F2 heurísticas | 11 | ~55 (vectores ya redactados) |
| F3 grafo/undo | 6 | ~35 + 2 property |
| F4 UI | 7 | ~30 |
| F5 persistencia | 3 | ~20 |
| **Total v1** | **34** | **~185 casos** |

El primer test que se escribe en el proyecto es `helpers.spec.ts`; el primer test que falla con sentido es `validators.spec.ts › RF-01`. A partir de ahí, siempre en rojo antes que en verde.
