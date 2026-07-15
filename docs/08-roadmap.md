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

## Fase 4 — Shell UI (est. 2-3 semanas)

- Top bar, toolbar, panel lateral (Detalles/Heurísticas/Investigación), command palette, overlay de atajos, toasts, tema (tokens del mock), i18n ES/EN, tour.
- **Salida**: la UI real coincide con el mock (screenshots Playwright); RF-26 verificado (toda acción por 3 vías); axe-core sin errores graves; RF-29/30 en verde.

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
