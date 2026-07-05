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

## Fase 2 — Heurísticas (est. 1-2 semanas, TDD puro)

- `address-type.ts` + H-01..H-09 + `score.ts`, cada una precedida por sus vectores del doc 04.
- **Salida**: todos los vectores en verde; regresiones BUG-006/007/008 en verde; cobertura `analysis/` ≥ 95 %; demo CLI/test que imprime las heurísticas de un txid real.

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
