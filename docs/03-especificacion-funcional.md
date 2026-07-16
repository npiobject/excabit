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

- **Una investigación es de una sola red.** Los txids de redes distintas no tienen nada que ver entre sí: un grafo con txs de dos redes no significa nada y, guardado, afirma algo falso.
- Given una investigación con nodos, When se cambia de red, Then se avisa de que el grafo se vaciará y se ofrece guardarlo antes; si se confirma, el grafo y el historial quedan vacíos y la red cambia.
- Given una investigación vacía, When se cambia de red, Then el cambio es inmediato y sin preguntar: no hay nada que perder.
- Given un fichero guardado en `testnet`, When se abre, Then la app se pone en testnet: el selector, la barra de estado y **el proveedor al que se piden los datos**.
- La red activa forma parte del estado de la investigación, no solo de la vista.

> Añadido el 2026-07-16 al implementar la Fase 6.4. Lo anterior estaba a medias: el selector cambiaba el proveedor pero no el estado, así que el grafo mezclaba txs de mainnet y testnet y el fichero las guardaba todas como si fueran de la última red elegida.

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

**RF-35 (P2) — Línea temporal.** Barra bajo el canvas con el rango de fechas de la investigación y dos tiradores; lo que cae fuera del rango se **atenúa**, no se borra.

> Especificado el 2026-07-16 (Fase 6.4). El roadmap lo nombraba como «línea temporal (P2)» sin definirlo. De las tres formas posibles se eligió el filtro por rango porque responde a la pregunta forense típica —«qué se movió entre el 3 y el 9 de marzo»— y no pelea con el layout radial (RF-05), que coloca por flujo y es la seña de identidad de la app.

- Given una investigación con transacciones confirmadas, When se abre la línea temporal, Then la barra abarca de la tx más antigua a la más reciente.
- Given un rango elegido, When se aplica, Then las txs fuera de rango se atenúan y **sus datos no cambian**: es una forma de mirar, no una edición (no entra en el historial, Ctrl+Z no la deshace).
- Given un rango, Then se dice cuántas txs quedan dentro (`12 de 47`): un filtro que no dice qué esconde es una trampa.
- **Las txs sin confirmar** (`blockTime: null`) no tienen fecha: **nunca se filtran**, porque filtrar por una fecha que no existe sería inventarla. Están en el mempool, que es «ahora».
- Given menos de dos txs con fecha, Then la barra no aparece: no hay rango que elegir.
- Se combina con el rastro de fondos (RF-18): un nodo se ve si pasa **los dos** filtros. «El rastro de este dinero, en marzo» es una pregunta legítima.
- Cerrar la línea temporal devuelve todo a la vista.

**RF-36 (P1) — Legibilidad con muchos nodos.** Un grafo que no cabe en la pantalla no informa de nada: si el usuario tiene que alejar al 13 % para verlo entero, ha dejado de ser una interfaz visual y es un manchurrón.

> Especificado el 2026-07-16 tras medir el problema en la app. Los números que lo motivan: el ejemplo (30 nodos) queda al **34 %** de zoom y una dirección con 6 txs (170 nodos) al **13 %**, donde una etiqueta ocupa 5 px. **El 96-97 % de los nodos son direcciones y el 98-100 % de ellas aparecen una sola vez**: el grafo está dominado por nodos que no llevan a ningún sitio. Y el radio del radial crece **lineal** con el número de satélites, mientras el semicírculo los reparte en 180° verticales — el grafo crece a lo alto y la pantalla es apaisada.

Cuatro mecanismos, complementarios. Los dos primeros cambian **cómo** se dibuja; los otros dos, **cuánto**:

- **RF-36.1 — Anillos concéntricos.** Given una Tx con más satélites de los que caben en un arco, When se coloca, Then se reparten en varios anillos y el radio crece como √N en vez de lineal. Sigue siendo el radial de RF-05: entradas a la izquierda, salidas a la derecha.
- **RF-36.2 — Detalle según el zoom.** Given un zoom por debajo del umbral de lectura, Then no se pinta el texto: a 13 % una etiqueta son 5 px de suciedad que emborronan sin informar. Los datos no cambian, solo lo que se dibuja.
- **RF-36.3 — Clusters plegables.** Given un cluster (RF-19), When se pliega, Then sus direcciones se representan por una sola caja que dice cuántas lleva dentro; al desplegarlo vuelven. Lo decide el usuario.
- **RF-36.4 — Direcciones de paso plegadas.** Given una Tx con muchas direcciones que solo tocan esa Tx (grado 1: no llevan a ningún sitio), When se pliegan, Then se representan por un nodo resumen `+N` que se despliega al pulsarlo.
  - **Nunca se ocultan sin decirlo.** El nodo resumen es visible, dice cuántas esconde y se abre con un click. «El grafo es la interfaz» (docs/00) sigue en pie: plegar es una forma de mirar, no de esconder. Un grafo ilegible tampoco enseña esas direcciones — solo finge que sí.
  - Plegar y desplegar **no tocan los datos**: no entran en el historial y Ctrl+Z no los deshace.

## 6. Requisitos no funcionales

- **RNF-01** 60 fps de interacción con 300 nodos; expansión < 2 s con red normal (caché caliente < 200 ms).
- **RNF-02** Sitio 100% estático; peso inicial del bundle < 500 KB gzip (el legacy servía 4,3 MB solo de p5).
- **RNF-03** Sin claves ni secretos en el repo (gitleaks en CI). **Proveedor único de datos: mempool.space, sin clave, para todas las consultas.** Única configuración admitida: cambiar la URL base para apuntar a una instancia autohospedada de mempool/Esplora (también sin clave).
- **RNF-04** Rate-limiting cliente con backoff para no abusar de la API pública.
- **RNF-05** Accesibilidad: navegación de paneles por teclado, contraste AA en el tema oscuro, `prefers-reduced-motion` respetado.
- **RNF-06** Resolución mínima 1280×720; degradación anunciada por debajo.
