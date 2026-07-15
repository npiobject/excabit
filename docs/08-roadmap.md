---
documento: Roadmap por fases
proyecto: excabit v2
estado: borrador
version: 0.1
fecha: 2026-07-04
---

# 08 — Roadmap

Cada fase entrega algo usable/verificable y cierra con criterios de salida explícitos. Las duraciones son estimaciones orientativas de esfuerzo neto.

## Fase 0 — Documentación y mock ✅ (esta entrega)

- Entregables: docs 00-08 + glosario; mock interactivo en `mocks/`; catálogo de bugs verificado contra el código.
- ~~Acción externa: revocar las claves NowNodes expuestas~~ **Resuelto**: verificado el 2026-07-05 que la clave activa está caducada (`401 Unknown API_key`). Nota: eso deja la app legacy publicada sin fuente de datos (inoperativa), lo que refuerza la urgencia de la v2.
- Salida: specs revisadas y mock aprobado (los tokens de `mocks/assets/tokens.css` quedan como definitivos).

> El detalle de suites y casos por fase está en [09-backlog-tdd.md](09-backlog-tdd.md).

## Fase 1 — Fundacional: dominio + datos (est. 2-3 semanas)

- Scaffold Vite+TS strict+Vitest+ESLint+Prettier+CI (GitHub Actions con gitleaks y size-limit).
- `core/types`, `core/store`, `data/` completo (provider mempool.space, normalizer, cache, rate-limiter).
- Fixtures reales congeladas (txids del doc 04) + MSW.
- **Salida**: `getTx`/`getAddress` devuelven `NormalizedTx` para los fixtures; cobertura `core/`+`data/` ≥ 90 %; regresiones BUG-002/003/004 en verde; cero secretos (gitleaks).

### Resultado (cerrada el 2026-07-15)

| Criterio de salida | Resultado |
|---|---|
| `getTx`/`getAddress` → `NormalizedTx` | ✅ verificado contra los 8 fixtures reales |
| Cobertura `core/`+`data/` ≥ 90 % | ✅ 98,1 % sentencias · 94,6 % ramas · 100 % líneas |
| Regresiones BUG-002/003/004 | ✅ en verde; BUG-002 comprobado por mutación (se reintrodujo el bug y la suite lo cazó) |
| Cero secretos | ✅ gitleaks 8.28 en verde; regla propia verificada con una clave de prueba en `src/` |

120 tests en 7 suites (el plan estimaba ~45 casos: la diferencia son ramas y
casos límite que aparecieron al escribirlos). Entregado también, no previsto:

- **Regla arquitectónica ejecutable**: `boundaries/dependencies` impide que
  `core/`/`data/`/`analysis/`/`persistence/` importen Cytoscape (ADR-001) o DOM.
  Requiere `eslint-import-resolver-typescript`: sin él la regla pasa en vacío
  porque no resuelve los imports y clasifica el destino como desconocido.
- **`.gitleaks.toml`**: la config por defecto NO detecta claves tipo UUID como
  las de NowNodes (BUG-001). Se añadió una regla propia que sí lo hace, con
  `old/` en allowlist (claves caducadas, archivo histórico).
- Fixtures de coinbase, taproot, CoinJoin Whirlpool 5×5 y OP_RETURN, con su
  índice en `tests/fixtures/README.md`.

**Ajuste al plan**: el doc 04 daba por hecho que la CoinJoin se elegiría "a ojo";
localizarla exigió escanear el bloque 724743 entero (11 candidatas en 1076 txs).
Las txs con 3+ salidas de importe idéntico son raras (11 de 300 en el muestreo),
lo que de paso confirma que H-09 tendrá poco ruido.

## Fase 2 — Heurísticas (est. 1-2 semanas, TDD puro)

- `address-type.ts` + H-01..H-09 + `score.ts`, cada una precedida por sus vectores del doc 04.
- **Salida**: todos los vectores en verde; regresiones BUG-006/007/008 en verde; cobertura `analysis/` ≥ 95 %; demo CLI/test que imprime las heurísticas de un txid real.

### Resultado (cerrada el 2026-07-15)

| Criterio de salida | Resultado |
|---|---|
| Vectores del doc 04 | ✅ los 9 (H-01..H-09) con sus V1..Vn |
| Regresiones BUG-006/007/008 | ✅ en verde, más BUG-009/010/011 |
| Cobertura `analysis/` ≥ 95 % | ✅ 97,9 % ramas · 100 % líneas · umbral por glob verificado (falla al 99 %) |
| Demo con un txid real | ✅ `npm run analyze -- <txid> [red]`, contra mempool.space |

244 tests en 18 suites. Decisiones tomadas al implementar:

- **`analysis/address-type.ts` no tiene su propio clasificador**: reexporta el de
  `core/validators`. Tener dos clasificadores ES el BUG-006; la defensa no es
  clasificar mejor, es no duplicar.
- **`Vin.scriptType`** (campo nuevo): H-03/H-04/H-05 necesitan el tipo de las
  entradas. Sale del proveedor (`prevout.scriptpubkey_type`), no de deducirlo de
  la dirección, porque deducirlo daría `unknown` en testnet y dejaría las
  heurísticas ciegas fuera de mainnet (RF-04).
- **Confianza `info`** (valor nuevo): H-08 solo informa. El doc la describe como
  «confianza n/a»; decirlo explícitamente es mejor que darle una confianza baja
  que el score tendría que aprender a ignorar. `info` penaliza 0.
- **H-09 exige ≥ 2 direcciones distintas** de entrada: agrupar una dirección
  consigo misma no revela nada. Y `looksLikeCoinJoin` exige ≥ 2 entradas además
  de salidas repetidas, para no confundir un pago por lotes (1 entrada → 30
  salidas iguales) con una mezcla y apagar CIOH donde sí es válida.

**Corrección al plan**: `docs/09` predecía score 52 para `85e72c…`; el valor real
aplicando el doc 04 es **60** (`address-reuse` −25 + `unnecessary-input` −15).
El 52 asumía una heurística *low* que no aplica: H-01 exige 1 entrada (hay 2) y
H-06 se descarta porque ambas salidas son redondas — su propio vector V4.
Corregido en `docs/09` y confirmado por el test contra el fixture real.

**Observación para la Fase 4 (UI)**: en `85e72c…` dos heurísticas se contradicen
—H-07 (high) dice que `vout[1]` es el cambio; H-02 (medium) lo señala como el
pago— y H-07 acierta. Es el comportamiento esperado y justo el argumento de la
propuesta de valor nº 3: mostrar cada heurística con su confianza en vez de un
veredicto único de caja negra. La UI debe ordenar por confianza, no fingir
consenso.

## Fase 3 — Grafo interactivo (est. 3-4 semanas)

- Spike inicial: layout radial `preset` en Cytoscape (válvula de la ADR-001).
- `graph-model`, `cy-adapter`, interacciones (expandir, drag, zoom, selección, área), comandos + undo/redo, minimapa.
- **Salida**: paridad con el legacy según la checklist F-05..F-17 de [01-analisis-legacy.md](01-analisis-legacy.md) §4; RNF-01 (60 fps/300 nodos); regresiones BUG-013/015/016 en verde; E2E "buscar→expandir→mover→undo" en CI.

### Resultado (cerrada el 2026-07-15)

**SPIKE ADR-001: confirmada, no se reabre.** Verificado contra Cytoscape real
(`tests/unit/graph/spike-cytoscape.spec.ts`): `preset` respeta posiciones
exactas, añadir nodos no recoloca los existentes, y zoom/pan son transformación
de vista — 20 zooms no mueven un píxel del modelo. Además drag grupal,
selección acumulable, borrado de aristas huérfanas y compound nodes.

| Criterio de salida | Resultado |
|---|---|
| Paridad F-05..F-17 | ✅ grafo, expansión, drag, zoom/pan, selección, borrado, undo/redo |
| Regresiones BUG-013/015/016 | ✅ en verde, más BUG-017 y BUG-020 |
| E2E "buscar→expandir→mover→undo" | ✅ 20 E2E en CI contra el build real, red mockeada |
| RNF-01 (60 fps / 300 nodos) | ⚠️ **~46 fps** (21,6 ms/frame). Ver abajo. |

337 tests unit + 20 E2E. Cobertura global 98,6 % sentencias · 95,2 % ramas.

**RNF-01 no se cumple del todo y no se disimula**: la medición real con 300
nodos y 300 aristas da **21,6 ms/frame ≈ 46 fps**, no los 60 exigidos. El pan es
fluido y el umbral del test (64 ms) protege contra regresiones de orden de
magnitud, pero el objetivo estricto queda pendiente: medir en un navegador con
GPU real (la cifra es de chromium headless) y, si se confirma, optimizar en la
Fase 4 con `hideEdgesOnViewport`/`textureOnViewport` o aligerando el estilado.

**Bug encontrado mirando la app, no los tests**: las txs vecinas aterrizaban
todas sobre la raíz (un `center: {0,0}` fijo en el wiring). Los 17 E2E pasaban
porque contaban nodos, y había 8 — pero el usuario veía 5. Se añadió
`GraphNode.placed` (colocado por el layout ≠ `pinned`, movido por el usuario),
cada vecina recibe su centro, y ahora hay un E2E que falla si dos nodos comparten
posición. Lección: contar entidades no prueba que se vean.

**Pendiente que pasa a la Fase 4**: el minimapa (RF-13) — es una pieza de shell y
encaja mejor con el resto de la UI. El shell de la Fase 3 es mínimo a propósito
(búsqueda + grafo + atajos), lo justo para poder probar el grafo de punta a punta.

## Fase 4 — Shell UI (est. 2-3 semanas)

- Top bar, toolbar, panel lateral (Detalles/Heurísticas/Investigación), command palette, overlay de atajos, toasts, tema (tokens del mock), i18n ES/EN, tour.
- **Salida**: la UI real coincide con el mock (screenshots Playwright); RF-26 verificado (toda acción por 3 vías); axe-core sin errores graves; RF-29/30 en verde.

### Resultado (cerrada el 2026-07-15)

| Criterio de salida | Resultado |
|---|---|
| La UI coincide con el mock | ✅ workspace completo: top bar, toolbar, canvas con cuadrícula, panel, minimapa, status bar, zoom |
| RF-26 (3 vías por acción) | ✅ registro único: toolbar, palette y atajos salen de él y no pueden divergir |
| axe-core sin errores graves | ✅ 0 violaciones serias/críticas en vacío, workspace, palette, atajos y tour |
| RF-29/30 | ✅ toasts con reintento y cero `alert()`; ES/EN con paridad de claves verificada |

360 tests unit + 62 E2E. También el **minimapa (RF-13)**, que arrastraba la Fase 3.

**Corrección a docs/06 §7 — los tokens NO cumplían AA.** El doc daba por
«verificado» el contraste de los tokens y axe-core lo desmiente: `--text-faint`
(#6e7681) sobre `--surface` da **3,76:1** y AA exige 4,5:1 para texto pequeño
(la status bar es de 11 px). Como RNF-05 también está aprobado, se corrige el
token a **#7d8590** (4,74:1, mismo tono azulado) en vez de rebajar el listón.
Igual con el `<kbd>`, que se quedaba en 4,45:1. **Los tokens del mock quedan
corregidos en este punto**; el resto se mantiene tal cual.

**Corrección al mock**: mostraba el badge `52` en la tx raíz. El valor real es
**60** (verificado en la Fase 2). Actualizado en `mocks/explorer.html` para que
no quede como referencia contradictoria.

Decisiones tomadas al implementar:

- **RF-01 se cumple literalmente**: la entrada mal formada da un error *inline*
  pegado a la búsqueda (con `aria-invalid`), no un toast. Los toasts son para
  errores de red (RF-29): un fallo del proveedor no es culpa de lo que escribiste.
- **`i18n/format.ts`, no `ui/format.ts`**: el grafo también necesita formatear
  importes y la regla de fronteras prohíbe `graph → ui`. Formatear un importe es
  traducirlo a la convención del lector.
- **El score se inyecta en el `cy-adapter`** (`scoreOf`): `graph/` no puede
  depender de `analysis/`, y el grafo no tiene por qué saber cómo se calcula un
  score, solo cómo pintarlo.
- **`fit()` no amplía por encima del 100%**: sin tope, una tx sola aparecía al
  211%. Ajustar puede alejar cuanto haga falta, pero nunca acercar de más.
- El panel ordena las heurísticas por confianza y las detectadas primero, en vez
  de fingir un consenso que no existe (docs/00 §3).
- **RNF-01 se mide en su propio proyecto de Playwright**, tras los demás:
  compartiendo CPU con 5 workers, la cifra medía el paralelismo, no la app.

**Sigue pendiente de la Fase 3**: RNF-01 real (~46 fps con 300 nodos, no 60).

## Fase 5 — Persistencia y export (est. 1-2 semanas)

- `.excabit.json` v2 + migrador del formato legacy, autosave IndexedDB, export PNG/SVG/CSV.
- **Salida**: round-trip save→load deep-equal; una investigación guardada con la app vieja se abre en la nueva; regresión BUG-019 en verde.

## Fase 6 — Funcionalidades diferenciales (iterativa, una release por feature)

Orden propuesto por valor/esfuerzo:
1. Seguimiento de flujo de fondos (RF-18).
2. Clustering de direcciones (RF-19).
3. Expansión inteligente paginada (RF-31).
4. Línea temporal (P2) y multi-red (RF-04).
5. Export avanzado + enlace permanente (RF-24).
6. Alertas de patrones, modo presentación, comparador (P3).

- **Salida de la 6.1 en adelante**: cada feature con su fila de la matriz de tests completa.
- **Cierre**: deploy en GitHub Pages sustituyendo al legacy; `old/` queda como archivo histórico; README nuevo.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Rate-limit de mempool.space | Caché agresiva (tx confirmadas inmutables) + backoff + posibilidad de nodo Esplora propio (ADR-002) |
| Direcciones con miles de txs | Expansión paginada (RF-31) desde el diseño |
| Layout radial no reproducible en Cytoscape | Spike al abrir Fase 3; única válvula de reapertura de ADR-001 |
| Alcance de Fase 6 crece sin control | Una release por feature; specs antes de código |
