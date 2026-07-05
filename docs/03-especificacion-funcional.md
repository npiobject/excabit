---
documento: Especificación funcional
proyecto: excabit v2
estado: borrador
version: 0.1
fecha: 2026-07-04
---

# 03 — Especificación funcional (excabit v2)

Cada requisito tiene ID `RF-XX`, prioridad (P1 imprescindible v1 / P2 alto valor / P3 exploratorio) y criterios de aceptación **Given/When/Then**. La matriz de trazabilidad RF↔test está en [07-plan-de-tests.md](07-plan-de-tests.md).

## 1. Búsqueda y entrada

**RF-01 (P1) — Búsqueda por txid.**
- Given la pantalla de inicio, When el usuario pega un txid válido (64 hex) y pulsa Enter/Buscar, Then se carga el workspace con esa Tx centrada en el grafo.
- Given un texto que no es 64 hex ni una dirección válida, When se intenta buscar, Then el input muestra error inline explicando el formato, sin popup.

**RF-02 (P1) — Detección automática del tipo de búsqueda.**
- Given una dirección Bitcoin válida (base58 `1…`/`3…` o bech32 `bc1…`), When se busca, Then se ofrece cargar sus transacciones (paginadas, RF-31).

**RF-03 (P1) — Ejemplo clicable.** Given la pantalla de inicio, When el usuario pulsa la tx de ejemplo, Then se carga sin teclear nada.

**RF-04 (P2) — Selector de red.** mainnet / testnet / signet (mismo API de mempool.space). El workspace indica siempre la red activa.

## 2. Grafo

**RF-05 (P1) — Layout radial inicial.** Given una Tx cargada, Then se renderiza al centro con sus inputs a la izquierda y outputs a la derecha como nodos dirección conectados; los outputs sin gastar se marcan visualmente como UTXO.

**RF-06 (P1) — Expansión por doble click.**
- Given una Tx colapsada visible, When doble click, Then se descargan sus datos y se añaden al grafo sus Tx vecinas y direcciones, sin recolocar los nodos que el usuario ya movió.
- Given una Tx ya expandida, When doble click, Then no se duplican nodos ni aristas (idempotente).

**RF-07 (P1) — Drag.** Nodos individuales, selección múltiple y pan del fondo. El drag nunca modifica datos de dominio, solo posiciones.

**RF-08 (P1) — Zoom/pan de viewport.** Rueda para zoom (centrado en el cursor), drag de fondo para pan, controles +/−/ajustar, sin deformar ni acumular error en el modelo (corrige BUG-015).

**RF-09 (P1) — Selección.** Click selecciona; shift+click acumula; shift+drag en fondo selecciona por área; Esc deselecciona. Nodos seleccionados con estilo distintivo.

**RF-10 (P1) — Etiquetas.** Given un nodo, When el usuario edita su etiqueta (doble click en la etiqueta, panel lateral o atajo), Then la etiqueta se muestra junto al nodo y persiste en la investigación.

**RF-11 (P1) — Colores.** Paleta de colores aplicable a la selección; persiste en la investigación.

**RF-12 (P1) — Eliminar.** Supr/tecla y botón eliminan la selección (nodos + aristas huérfanas), con undo disponible. Sin "modo eliminar" de círculos rojos.

**RF-13 (P1) — Minimapa.** Vista general con viewport actual; click/drag navega.

**RF-14 (P2) — Alineación y cuadrícula.** Guías de alineación al arrastrar, cuadrícula conmutables, y acción "reordenar layout" (sustituye a la tecla `m` muerta del legacy).

## 3. Información y análisis

**RF-15 (P1) — Panel de detalles.** Given un nodo seleccionado, Then el panel lateral muestra: txid completo con copy-on-click, bloque, fecha, importe, fee y feerate, nº inputs/outputs, versión, locktime, tipos de script; para direcciones: dirección, tipo, saldo implicado en el grafo. Enlace "ver en mempool.space".

**RF-16 (P1) — Heurísticas visibles.** Given una Tx con datos cargados, Then el panel Heurísticas muestra cada heurística de [04-heuristicas-privacidad.md](04-heuristicas-privacidad.md) con: resultado (detectado / no aplica / sin datos), explicación pedagógica y nivel de confianza. El nodo muestra un badge con el score agregado.

**RF-17 (P2) — Tooltip al hover.** Resumen compacto (id corto, importe, fee, badge heurístico) sin ocupar el panel.

**RF-18 (P2) — Seguimiento de flujo de fondos.** Given un output marcado como origen, When se activa "seguir fondos", Then se resalta el camino de esos fondos por el grafo expandido con suma acumulada y nº de saltos.

**RF-19 (P2) — Clustering de direcciones.** Heurística common-input-ownership agrupa direcciones en clusters visuales (compound nodes) con nombre editable.

**RF-20 (P3) — Alertas de patrones.** Al expandir, detectar y avisar de peel chains, posibles CoinJoin y consolidaciones.

## 4. Persistencia y export

**RF-21 (P1) — Guardar/cargar investigación.** Fichero `.excabit.json` versionado (schema en spec técnica) con grafo, posiciones, etiquetas, colores, notas y metadatos. Given un fichero de la app legacy, When se importa, Then un migrador lo convierte o explica qué no pudo migrar.

**RF-22 (P1) — Autosave.** La investigación en curso se guarda en IndexedDB; al volver, se ofrece restaurar.

**RF-23 (P1) — Export imagen.** PNG (y SVG en P2) del grafo completo o del viewport.

**RF-24 (P2) — Export datos.** CSV de nodos y aristas (para Excel/Gephi). Enlace permanente que codifica la investigación en la URL (si cabe) o aviso de usar fichero.

**RF-25 (P2) — Notas.** Nota de texto libre por nodo y por investigación.

## 5. Usabilidad transversal

**RF-26 (P1) — Toda acción descubrible por 3 vías**: botón visible (toolbar/panel), atajo mostrado en su tooltip, y command palette (Ctrl+K) con búsqueda.

**RF-27 (P1) — Overlay de atajos** con tecla `?`.

**RF-28 (P1) — Undo/redo de datos** (Ctrl+Z / Ctrl+Y) para toda mutación de la investigación (añadir, mover, etiquetar, colorear, eliminar, cluster). Given 100 operaciones deshechas y rehechas, Then el estado es idéntico al original (test de propiedad).

**RF-29 (P1) — Estados de carga y error.** Toda petición muestra indicador no bloqueante; errores de red → toast con causa y botón reintentar. Nunca `alert()`.

**RF-30 (P1) — i18n ES/EN** conmutables en caliente; el idioma persiste.

**RF-31 (P2) — Expansión inteligente.** Given una dirección/Tx con más de N (por defecto 25) vecinos, When se expande, Then se cargan los N más recientes y se ofrece paginar; nunca se congela la UI (sustituye al "Multi Tx" del legacy, BUG-016).

**RF-32 (P2) — Tour de primer uso** (4-5 pasos) y estado vacío con guía; sustituye a los vídeos mp4.

**RF-33 (P3) — Modo presentación**: oculta paneles para docencia/captura.

**RF-34 (P3) — Comparador de Txs**: dos Txs lado a lado con sus heurísticas.

## 6. Requisitos no funcionales

- **RNF-01** 60 fps de interacción con 300 nodos; expansión < 2 s con red normal (caché caliente < 200 ms).
- **RNF-02** Sitio 100% estático; peso inicial del bundle < 500 KB gzip (el legacy servía 4,3 MB solo de p5).
- **RNF-03** Sin claves ni secretos en el repo (gitleaks en CI). **Proveedor único de datos: mempool.space, sin clave, para todas las consultas.** Única configuración admitida: cambiar la URL base para apuntar a una instancia autohospedada de mempool/Esplora (también sin clave).
- **RNF-04** Rate-limiting cliente con backoff para no abusar de la API pública.
- **RNF-05** Accesibilidad: navegación de paneles por teclado, contraste AA en el tema oscuro, `prefers-reduced-motion` respetado.
- **RNF-06** Resolución mínima 1280×720; degradación anunciada por debajo.
