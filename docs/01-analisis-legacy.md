---
documento: Análisis de la aplicación legacy
proyecto: excabit v2
estado: borrador
version: 0.1
fecha: 2026-07-04
---

# 01 — Análisis de la aplicación legacy (`old/`)

## 1. Inventario de ficheros

| Fichero | Líneas aprox. | Responsabilidad real |
|---|---|---|
| `old/index.html` | 45 | Carga de scripts, cabecera de la segunda pantalla |
| `old/exploraGraf.js` | 1.350 | `setup()`/`draw()` de p5, ~60 variables globales, 12 event listeners, flujo de pantallas, undo visual |
| `old/clases/bchain.js` | 3.728 | **Clase-dios**: fetching, modelo de datos, layout radial, render p5, ventanas de info, ayuda/vídeos, grabación, persistencia JSON/localStorage. Crea 47 elementos de UI |
| `old/clases/conex.js` | 147 | Cliente HTTP de NowNodes (tx, address, utxo) con claves hardcodeadas |
| `old/clases/heuristic.js` | 483 | 7 heurísticas de privacidad + clasificación de tipos de dirección |
| `old/clases/canvas.js` | 50 | Creación de los dos canvas (entrada y trabajo) |
| `old/clases/ventana.js` | 79 | Render de ventanas flotantes sobre el canvas |
| `old/assets/miEstilo.css` | 484 | Estilos de botones/inputs p5 y cabecera |
| `old/clases/p5.js` / `p5.min.js` / `p5.capture.umd.js` | — | Librerías (4,3 MB sin minificar en producción) |
| `old/clases/txs` | 1 | Un txid suelto (dato de prueba) |
| `old/media/` | — | Logos, fondo, favicon, 13 vídeos mp4 de ayuda |

No existe `package.json`, ni build, ni tests, ni linter. Total de código propio: ~6.300 líneas.

## 2. Arquitectura real (dependencias)

```
index.html
  └─ carga en orden: p5.js → p5.capture → conex.js → bchain.js → canvas.js → ventana.js → heuristic.js → exploraGraf.js

exploraGraf.js  ── declara ~60 globals y las instancias myConex, myCanvas, myBchain, myVentana, myHeuristic
      │  (setup/draw + 12 window.addEventListener)
      ▼
bchain.js  ──── lee/escribe las globals de exploraGraf ──── usa myConex, myVentana, myHeuristic, myCanvas
      │
conex.js   ──── lee/escribe las globals datosTxNN y divGifAnimado (¡el cliente HTTP toca la UI!)
heuristic.js ── sin dependencias externas (la única clase razonablemente aislada)
canvas.js / ventana.js ── leen globals y llaman a métodos de myBchain
```

Conclusión: **no hay fronteras**. Todos los módulos se comunican por estado global mutable; el flujo de control se coordina con "variables semáforo" (`estadoMoviendoTx`, `estadoAreaSelec`, `estadoAplicaZoom`…) que `draw()` sondea a 60 fps.

## 3. Catálogo COMPLETO de funcionalidades actuales

### Pantalla de entrada
- F-01. Input de txid con valor de ejemplo precargado; botón **Go**.
- F-02. **Cargar Tx** desde fichero JSON guardado previamente.
- F-03. Vídeo de presentación y 8 botones a vídeos de ayuda (mp4 en GitHub Pages).
- F-04. Al buscar, si existe la investigación en `localStorage[txid]`, se restaura.

### Grafo (segunda pantalla)
- F-05. Layout radial: Tx de estudio al centro; direcciones I/O como satélites; cada dirección conecta con su otra Tx (origen/destino).
- F-06. **Doble click** en una Tx: la expande (descarga sus vin/vout y añade nodos). Las salidas sin gastar se representan como **UTXO** (triángulo) y los conjuntos grandes como **Multi Tx** (nodo agregado; su edición está sin terminar, solo hace console.log).
- F-07. **Drag** de una Tx individual (las direcciones conectadas se recalculan).
- F-08. **Shift+click**: seleccionar/deseleccionar Txs (borde rojo); drag mueve el conjunto.
- F-09. **Shift+drag** (o tecla `z` + drag) en fondo: selección por área rectangular.
- F-10. **Drag en fondo** (sin teclas): pan de todo el grafo.
- F-11. **Rueda**: zoom (reescala posiciones y tamaños, ±3% por tick).
- F-12. **Ctrl+click** en Tx: editar etiqueta (input flotante).
- F-13. **Alt+click** en Tx: paleta de 7 colores para el fondo del nodo.
- F-14. **Tecla `d` + click**: modo eliminar (círculos rojos); click en círculo elimina la Tx y sus direcciones; botón "eliminar" marca todas.
- F-15. **Hover** sobre Tx/Addr: caja de información (si "con info." activo).
- F-16. **Tecla `i` + click**: ventana de información detallada de Tx (id, bloque, fecha, importes, fees, versión, locktime, heurísticas) o de Addr.
- F-17. Toolbar inferior: cuadrícula, selec., centrar, sombra, eliminar, alinear (líneas blancas de alineación al arrastrar), con/sin info., imprimir, vídeo, save; sliders de tamaño de Tx y distancia de Addr.
- F-18. **Tecla `p`**: exportar canvas a PNG con fecha+txid en el nombre.
- F-19. **Tecla `v`**: controles de grabación de vídeo del canvas (p5.capture).
- F-20. **Ctrl+Z**: undo (restaura capturas de imagen del canvas — solo visual, los datos no se revierten).
- F-21. **save**: descarga JSON de la investigación (posiTxs, posiAddrs, tamaños, flags) y copia en localStorage.
- F-22. Datos en segundo plano: tras añadir Txs, un semáforo dispara la descarga de blockHeight, value, vin/vout, fees, versión, locktime y heurísticas de cada Tx visible.
- F-23. Cabecera fija con logo, título, txid en estudio y botón Ayuda.
- F-24. Heurísticas por Tx (7): se muestran en la ventana de info; ver [04-heuristicas-privacidad.md](04-heuristicas-privacidad.md).

### Mapa de atajos actual (indocumentado en la UI)

| Tecla/gesto | Acción |
|---|---|
| doble click | Expandir Tx |
| shift+click | Seleccionar Tx |
| shift+drag / z+drag | Selección por área |
| ctrl+click | Etiquetar |
| alt+click | Color |
| d+click | Modo eliminar |
| i+click | Ventana info |
| p | Exportar PNG |
| v | Grabación vídeo |
| m | (deshabilitado, "mover Txs automáticamente" V2) |
| ctrl+z | Undo visual |
| rueda | Zoom |

## 4. Decisión: conservar / rehacer / descartar

| Funcionalidad | Decisión v2 |
|---|---|
| F-05..F-17, F-21..F-24 (núcleo grafo + edición + info + heurísticas + save) | **Rehacer** sobre Cytoscape.js con paridad funcional (checklist de esta tabla) |
| F-01, F-02, F-04 (entrada, carga JSON, localStorage) | **Rehacer** (JSON versionado `.excabit.json` con migrador del formato legacy) |
| F-18 export PNG | **Rehacer** y ampliar (SVG, CSV) |
| F-20 undo visual | **Sustituir** por undo/redo de datos (patrón Command) |
| F-19 grabación de vídeo in-app | **Descartar** (grabar pantalla es trivial en cualquier SO; elimina 1 MB de dependencia) |
| F-03 vídeos mp4 de ayuda | **Sustituir** por tour interactivo de primer uso + overlay de atajos |
| Multi Tx (F-06, a medio hacer) | **Rehacer** como "expansión inteligente" con paginación (spec RF-31) |
| Tecla `m` (muerta) | **Descartar** (su intención — layout automático — la cubre Cytoscape) |

## 5. Defectos estructurales que motivan la reescritura

1. Estado global mutable compartido (~60 variables) sin fuente de verdad única.
2. Clase-dios `Bchain` con 6 responsabilidades distintas y métodos muertos (`kk_*`, `No_utilizada_*`, `V_2_*`, `No_habilitada_*`).
3. Render immediate-mode: cualquier cambio exige redibujar todo y el estado de interacción vive en semáforos sondados por `draw()`.
4. UI construida con elementos DOM de p5 posicionados en píxeles absolutos y "ocultados" en `position(-20000,-20000)`.
5. Cliente HTTP acoplado a la UI (muestra/oculta el gif de descarga) y con claves API en el código.
6. Sin tests: los bugs de las heurísticas (ver catálogo) llevan años inertes sin detectarse.

El detalle bug a bug, con severidad y fichero:línea, está en [02-catalogo-bugs.md](02-catalogo-bugs.md).
