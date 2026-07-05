---
documento: Plan de tests (TDD)
proyecto: excabit v2
estado: borrador
version: 0.1
fecha: 2026-07-04
---

# 07 — Plan de tests (TDD)

> Este documento define la **estrategia**; el desglose operativo (suites, casos concretos y orden de escritura) está en [09-backlog-tdd.md](09-backlog-tdd.md).

Regla de oro del proyecto: **ningún módulo de `core/`, `data/`, `analysis/` o `persistence/` se escribe sin su test antes.** La lección del legacy: las heurísticas llevaban años dando resultados incorrectos (BUG-006..009) sin que nadie lo notara porque no había un solo test.

## 1. Pirámide

| Nivel | Herramienta | Alcance | Cuándo corre |
|---|---|---|---|
| Unit | Vitest | funciones puras: heurísticas, normalizer, cache, commands/undo, address-type, score, migrador | pre-commit y CI |
| Integración | Vitest + MSW | ApiClient contra respuestas simuladas de mempool.space (fixtures reales congeladas); flujo comando→store→eventos | CI |
| E2E | Playwright | flujos de usuario completos contra build real con red mockeada | CI (matriz Chromium/Firefox) |
| Visual | Playwright screenshots | workspace coincide con el mock aprobado | CI (job tolerante) |
| Seguridad | gitleaks | ningún secreto en el repo (regresión BUG-001) | CI, bloqueante |

Cobertura mínima bloqueante en CI: `core/` + `data/` ≥ 90 %, `analysis/` ≥ 95 %.

## 2. Fixtures

`tests/fixtures/*.json`: respuestas reales de mempool.space congeladas en Fase 1 para los txids semilla (ver [04-heuristicas-privacidad.md](04-heuristicas-privacidad.md) §Fixtures):
`85e72c08…4b70f2`, `993ced02…80415a`, `1d053e14…50e912`, `aaeb5265…8d530b`, más una tx taproot y una CoinJoin. Además, un `legacy-save.json` generado con la app vieja para el migrador.

Los vectores de test unitarios de heurísticas NO usan fixtures de red: construyen `NormalizedTx` sintéticas (builder `txFixture()`) — los vectores V1..Vn de cada heurística están en el doc 04.

## 3. Matriz de trazabilidad RF ↔ tests

| RF | Tests (nivel) |
|---|---|
| RF-01 búsqueda por txid | unit: validador txid · E2E: buscar y cargar; error inline con entrada inválida |
| RF-02 detección tipo de búsqueda | unit: clasificador txid/dirección (base58 y bech32) · E2E: buscar dirección ofrece cargar sus txs |
| RF-03 ejemplo clicable | E2E inicio |
| RF-04 multi-red | unit: provider construye URLs por red · E2E cambio de red e indicador visible |
| RF-05 layout radial | unit: layout-radial posiciones esperadas · visual |
| RF-06 expansión idempotente | unit: AddTxData no duplica · E2E doble click ×2 |
| RF-07 drag | E2E: drag de nodo/selección/pan no muta datos de dominio (solo posiciones) |
| RF-08 zoom/pan viewport | E2E: zoom no acumula error (posiciones del modelo estables tras 20 ruedas — regresión BUG-015) |
| RF-09 selección | E2E shift+click y área; Esc deselecciona |
| RF-10 etiquetas | unit: comando SetLabel con undo · E2E editar y persistir |
| RF-11 colores | unit: comando SetColor con undo · E2E aplicar a selección |
| RF-12 eliminar | unit: DeleteSelection limpia aristas huérfanas + undo restaura |
| RF-13 minimapa | E2E básico (viewport se refleja; click navega) |
| RF-14 alineación/cuadrícula/reordenar | E2E: toggles conmutan; "reordenar layout" reposiciona sin perder datos |
| RF-15 panel detalles | integración: normalizer → panel model · E2E |
| RF-16 heurísticas UI | unit: score.ts · E2E pestaña con semáforos y confianza |
| RF-17 tooltip hover | E2E: hover muestra resumen; desaparece al salir |
| RF-18 flujo de fondos | unit: taint.ts con grafo sintético (suma acumulada, hops) |
| RF-19 clustering | unit: clustering.ts (V1/V2 de H-09) |
| RF-20 alertas de patrones (P3) | vectores por patrón (peel chain, CoinJoin) al especificar la feature en Fase 6 |
| RF-21 save/load + migrador | unit: round-trip deep-equal · unit: migra legacy-save.json · unit: rechaza JSON inválido con error claro (regresión BUG-019) |
| RF-22 autosave | integración IndexedDB (fake-indexeddb) |
| RF-23 export imagen | E2E: descarga PNG/SVG no vacíos y con dimensiones correctas |
| RF-24 export datos / enlace | E2E: CSV de nodos y aristas abre en hoja de cálculo · unit: enlace permanente codifica/decodifica round-trip |
| RF-25 notas | unit: comando SetNote con undo · E2E persistencia en la investigación |
| RF-26 acciones por 3 vías | unit: shortcuts.ts sin colisiones · E2E: toda acción registrada aparece en toolbar/atajo/palette |
| RF-27 overlay de atajos | E2E: `?` abre el overlay y lista todos los atajos registrados |
| RF-28 undo/redo | **test de propiedad**: secuencia aleatoria de N comandos + N undos ⇒ estado inicial; 100 ciclos sin crecimiento de heap (regresión BUG-013) |
| RF-29 errores | integración MSW: 404, 429, timeout → toasts tipados, sin alert |
| RF-30 i18n | unit: claves ES=EN completas (sin huecos) |
| RF-31 expansión paginada | integración: dirección con 5.000 txs → 25 + cursor |
| RF-32 tour primer uso | E2E: primer arranque muestra el tour; no reaparece tras completarlo |
| RF-33 modo presentación (P3) | E2E al especificar la feature en Fase 6 |
| RF-34 comparador de txs (P3) | E2E al especificar la feature en Fase 6 |
| RNF-01 rendimiento | E2E: 300 nodos, medir fps de pan (umbral en CI laxo, estricto en local) |
| RNF-02 peso bundle | CI: size-limit < 500 KB gzip |
| RNF-03 secretos | gitleaks |
| RNF-04 rate-limit | unit: rate-limiter con temporizadores falsos |

## 4. Tests de regresión de bugs del legacy

Cada bug funcional del [catálogo](02-catalogo-bugs.md) que aplique a v2 tiene un test nombrado con su ID:

- `regression/bug-002.spec.ts` — la caché nunca almacena thenables.
- `regression/bug-006.spec.ts` — vectores V4 de H-01 (tipos de dirección mezclados).
- `regression/bug-007.spec.ts` — vector V4 de H-02 (comparación con valores reales de inputs).
- `regression/bug-008.spec.ts` — vector V3 de H-06 (precedencia).
- `regression/bug-013.spec.ts` — propiedad de undo (memoria y coherencia).
- `regression/bug-015.spec.ts` — zoom estable.
- `regression/bug-019.spec.ts` — import valida schema.

## 5. Ciclo TDD por fase

1. Tomar el RF/heurística de la spec; copiar sus criterios G/W/T como nombres de test (`describe('RF-06') → it('no duplica nodos al expandir dos veces')`).
2. Rojo → verde → refactor; el PR enlaza RF y tests.
3. Un RF no se da por hecho hasta que su fila de la matriz está completa y en verde en CI.

## 6. Definición de hecho (DoD)

- Tests de la matriz en verde + cobertura sobre umbral.
- Sin nuevos warnings de ESLint; gitleaks limpio.
- Si toca UI: screenshot Playwright actualizado y revisado contra el mock.
- Documentación del RF actualizada si el comportamiento se refinó durante la implementación.
