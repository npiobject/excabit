---
documento: Diseño UI/UX
proyecto: excabit v2
estado: borrador
version: 0.1
fecha: 2026-07-04
---

# 06 — Diseño UI/UX

El mock navegable de referencia está en [`mocks/`](../mocks/index.html) (abrir `index.html` y `explorer.html` en el navegador). Los tokens de `mocks/assets/tokens.css` son la fuente de verdad del tema y se reutilizarán tal cual en la app real.

## 1. Concepto visual

Tema oscuro "forense": la app es una mesa de trabajo de análisis, el grafo es el protagonista y la UI se retira a los bordes. Acento naranja Bitcoin para acciones primarias y la Tx raíz; verde/rojo reservados a semántica de entradas/salidas; ámbar para señales de heurísticas.

### Tokens de diseño (aprobados con el mock)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0d1117` | Fondo del workspace |
| `--surface` | `#161b22` | Paneles, top bar, toolbar |
| `--surface-2` | `#1f2630` | Hover, tarjetas, inputs |
| `--border` | `#2d333b` | Bordes sutiles |
| `--text` | `#e6edf3` | Texto principal |
| `--text-dim` | `#8b949e` | Texto secundario |
| `--accent` | `#f7931a` | Naranja Bitcoin: CTA, tx raíz, foco |
| `--input` | `#3fb950` | Verde: entradas (flujo entrante) |
| `--output` | `#f85149` | Rojo: salidas (flujo saliente) |
| `--utxo` | `#58a6ff` | Azul: outputs sin gastar |
| `--warn` | `#d29922` | Ámbar: heurísticas detectadas |
| `--ok` | `#3fb950` / `--bad` `#f85149` | Score de privacidad |

Tipografía: **Inter** (UI) + **JetBrains Mono** (hashes, importes, direcciones). Hashes siempre truncados `85e72c…4b70f2` con copy-on-click y tooltip del valor completo.

## 2. Layout del workspace

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOP BAR: logo · búsqueda global · red (mainnet ▾) · ⌘K · ? · ES/EN   │
├───┬──────────────────────────────────────────────────┬───────────────┤
│ T │                                                  │ PANEL LATERAL │
│ O │                                                  │ ┌───────────┐ │
│ O │                 CANVAS DEL GRAFO                 │ │Detalles   │ │
│ L │            (Cytoscape: zoom/pan/drag)            │ │Heurísticas│ │
│ B │                                                  │ │Investig.  │ │
│ A │                                   ┌─────────┐    │ └───────────┘ │
│ R │                                   │ minimapa│    │  (colapsable) │
├───┴───────────────────────────────────┴─────────┴────┴───────────────┤
│ STATUS BAR: 12 nodos · 14 aristas · mempool.space · zoom 100% · ●    │
└──────────────────────────────────────────────────────────────────────┘
```

- **Top bar**: búsqueda siempre visible (txid/dirección con validación inline, RF-01/02); selector de red (RF-04); botón ⌘K abre la palette; `?` abre atajos; conmutador ES/EN.
- **Toolbar izquierda** (vertical, iconos con tooltip que incluye el atajo — RF-26): seleccionar (V), área (A o shift+drag), etiquetar (T), colorear (C), eliminar (Supr), seguir fondos (F), cluster (G), alinear/cuadrícula, centrar (0), export (E).
- **Panel lateral derecho** (colapsable, 320 px): pestañas *Detalles* (RF-15), *Heurísticas* (RF-16, semáforos + explicación pedagógica + confianza), *Investigación* (lista de nodos/etiquetas/notas, RF-25).
- **Minimapa** (RF-13) abajo-derecha del canvas, **minimizable** a una píldora compacta (click en su cabecera, atajo `M` o palette). Posición fija deliberadamente — no arrastrable: la referencia espacial constante vale más que la libertad de colocación, y minimizar resuelve la oclusión sin añadir estado. Controles de zoom +/−/fit abajo-izquierda.
- **Status bar**: nº nodos/aristas, provider y estado (● verde ok / ámbar rate-limited), zoom, red.

## 3. Lenguaje visual del grafo

| Elemento | Representación |
|---|---|
| Tx raíz | Rectángulo redondeado, borde `--accent`, badge de score |
| Tx | Rectángulo redondeado `--surface-2`, id corto + importe + badge score |
| Tx sin expandir | Mismo estilo con indicador «+» (afordancia de doble click) |
| Dirección | Nodo pequeño circular; arista verde si alimenta (input), roja si recibe (output) |
| UTXO | Nodo diamante azul `--utxo` |
| Cluster | Compound node: halo punteado con nombre editable |
| Selección | Borde 2px `--accent` + handles |
| Flujo seguido (RF-18) | Aristas del camino en `--accent` grueso, resto atenuado |

Estados: hover eleva (sombra suave + tooltip RF-17); carga muestra skeleton pulsante en el nodo que expande; error deja el nodo con borde `--bad` y toast.

## 4. Interacciones y atajos (registro único, RF-26/27)

| Acción | Ratón | Atajo | Palette |
|---|---|---|---|
| Buscar | click en búsqueda | `/` | «Buscar…» |
| Expandir Tx | doble click | Enter (con selección) | «Expandir» |
| Seleccionar múltiple | shift+click / shift+drag | — | — |
| Etiquetar | botón panel | `T` | «Etiquetar» |
| Colorear | botón toolbar | `C` | «Color…» |
| Eliminar | botón | `Supr` | «Eliminar selección» |
| Undo / Redo | — | `Ctrl+Z` / `Ctrl+Y` | «Deshacer» |
| Zoom fit | botón | `0` | «Ajustar vista» |
| Seguir fondos | botón | `F` | «Seguir fondos» |
| Guardar / Abrir | — | `Ctrl+S` / `Ctrl+O` | «Guardar investigación» |
| Export PNG/SVG/CSV | botón | `E` | «Exportar…» |
| Palette | botón ⌘K | `Ctrl+K` | — |
| Ayuda atajos | botón ? | `?` | «Atajos» |

Cambios deliberados respecto al legacy: desaparecen los modos por tecla mantenida (`d+click`, `i+click`, `alt+click`, `ctrl+click`) — eran indetectables y chocan con atajos del navegador; sus funciones pasan a selección + acción visible.

## 5. Flujos clave

1. **Primer uso**: inicio → estado vacío con búsqueda protagonista + tx de ejemplo clicable (RF-03) → tour de 5 pasos señalando búsqueda, doble click, panel, palette y guardar (RF-32).
2. **Investigación**: buscar → expandir → etiquetar/colorear → seguir fondos → guardar `.excabit.json` (con autosave de respaldo, RF-22).
3. **Análisis de privacidad**: seleccionar tx → pestaña Heurísticas → cada heurística con semáforo (● detectada / ○ no aplica / − sin datos), texto pedagógico y confianza → score explicado.

## 6. Estados vacío / carga / error

- **Vacío**: ilustración ligera + «Pega un txid o prueba con este ejemplo».
- **Carga**: skeletons en panel; spinner discreto en status bar; nunca bloquear el canvas.
- **Error de red**: toast persistente con causa y «Reintentar»; el nodo afectado queda marcado. Sin `alert()` (RF-29).
- **Rate-limit**: status bar en ámbar + cola visible («3 peticiones en espera»).

## 7. Accesibilidad (RNF-05)

Contraste AA sobre `--bg`/`--surface` verificado en los tokens; foco visible en todos los controles; paneles navegables por teclado; `prefers-reduced-motion` desactiva animaciones de layout; los colores I/O van siempre acompañados de forma/dirección (no solo color).

## 8. Qué valida el mock

1. Jerarquía del workspace (top bar / toolbar / canvas / panel / status).
2. Tokens de color y tipografía sobre datos reales de una tx.
3. Afordancia de expansión («+»), tooltips con atajos, drag de nodos.
4. Pestaña Heurísticas con semáforos y explicaciones.
5. Command palette y overlay de atajos.

Criterio de aceptación: una persona sin contexto entiende qué hace la app y localiza cualquier acción en <10 s.
