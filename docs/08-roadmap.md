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
| RNF-01 (60 fps / 300 nodos) | ⚠️ **~46 fps** (21,6 ms/frame) al cerrar la fase. **Saldado el 2026-07-16**: ver [Fase 4 bis](#fase-4-bis--deuda-saldada-rnf-01-2026-07-16). |

337 tests unit + 20 E2E. Cobertura global 98,6 % sentencias · 95,2 % ramas.

**RNF-01 no se cumple del todo y no se disimula**: la medición real con 300
nodos y 300 aristas da **21,6 ms/frame ≈ 46 fps**, no los 60 exigidos. El pan es
fluido y el umbral del test (64 ms) protege contra regresiones de orden de
magnitud, pero el objetivo estricto queda pendiente: medir en un navegador con
GPU real (la cifra es de chromium headless) y, si se confirma, optimizar en la
Fase 4 con `hideEdgesOnViewport`/`textureOnViewport` o aligerando el estilado.

> **Epílogo (2026-07-16)**: las tres hipótesis de arriba eran falsas. Ni el
> estilado ni las aristas ni el motor tenían la culpa —era el minimapa— y
> `hideEdgesOnViewport`/`textureOnViewport` no aportan nada medible. El
> diagnóstico está en [Fase 4 bis](#fase-4-bis--deuda-saldada-rnf-01-2026-07-16).

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
→ Saldado justo después; ver abajo.

## Fase 4 bis — Deuda saldada: RNF-01 (2026-07-16)

**60,0 fps con 300 nodos y 300 aristas, medidos con GPU real.** RNF-01 se cumple
sin tocar el umbral: el objetivo era la app, no el listón.

| Escenario (300 nodos/aristas) | Antes | Después |
|---|---|---|
| Pan, GPU real (Intel UHD, D3D11) | 18,79 ms · 53,2 fps | **16,67 ms · 60,0 fps** |
| Pan, headless (SwiftShader, software) | 18,61 ms · 53,7 fps | **16,78 ms · 59,6 fps** |
| Coste del minimapa por frame | 2,11 ms | **0,00–0,12 ms** |

### Lo que decían los docs y lo que resultó ser

Las tres hipótesis anotadas al cerrar la Fase 3 (`hideEdgesOnViewport`,
`textureOnViewport`, aligerar el estilado) apuntaban al motor del grafo. **Las
tres eran falsas.** Medidas por separado, `hideEdgesOnViewport` y
`textureOnViewport` no mueven la aguja ni un 1 %: el grafo ya iba a 60 fps.

**El culpable era el minimapa (RF-13)**, que se repintaba entero —300 nodos, 300
aristas, un `boundingBox()` sobre 600 elementos y un `getBoundingClientRect()`—
en cada frame de pan. Irónico: la pieza que se añadió *después* de medir los
46 fps era la que los causaba, porque la medición de la Fase 3 se hizo con el
shell mínimo, sin minimapa.

### La trampa de medición: vsync

**La cifra de «46 fps» estaba capada por vsync y nadie lo anotó.** Medir con
`requestAnimationFrame` mide el intervalo *entre* frames, y el compositor no
entrega frames más rápido que el refresco de la pantalla: a 60 Hz el suelo es
16,67 ms. Un resultado de 16,67 ms no es «justo en el límite», es «el trabajo
cabe y sobra». Eso hace la métrica interpretable —60 fps es el techo, no una
aspiración— y explica por qué «sin minimapa» daba 16,66 ms clavados.

### El arreglo: dos capas, porque hay dos ritmos

El grafo en miniatura cambia al añadir, borrar o mover un nodo. El recuadro del
viewport cambia 60 veces por segundo. Pintarlos en la misma capa obliga al lento
al ritmo del rápido. Ahora el grafo vive en un canvas cacheado y un pan solo lo
copia y dibuja el recuadro encima. Además, el tamaño se lee del `ResizeObserver`
en vez de con `getBoundingClientRect()` por frame, que forzaba un recálculo de
layout 60 veces por segundo para leer un número que casi nunca cambia (ese
detalle solo valía 0,5 ms, pero era el último medio milisegundo).

### El test que vale en CI no mide tiempo

Un umbral en ms es rehén de la máquina: el estricto (18,5 ms) falló al correr
tras los otros 62 tests pese a que la app daba 16,67 ms aislada. Dos respuestas:

- **La medida se hace robusta**, no laxa: mediana de 5 tandas, descartando una de
  calentamiento. La mediana ignora el hipo puntual pero no perdona una lentitud
  real —si la app fuera lenta, todas las tandas lo serían.
- **La garantía de CI es estructural, no temporal**: un test afirma que un pan
  repinta el viewport y **no** repinta el grafo (`Minimap.stats`). No depende del
  reloj, la máquina ni el vsync, y ataca la causa raíz: si alguien vuelve a
  meter el grafo en el bucle de pan, se cae en CI. Antes del arreglo daba 32
  repintados en un pan de 30 frames; ahora, 0.

**Lección**: la deuda decía «optimizar el grafo» y el grafo no tenía nada que
optimizar. Perfilar antes de optimizar no es ceremonia — las tres optimizaciones
propuestas de buena fe habrían añadido complejidad para no ganar nada, mientras
el coste real estaba en la pieza que nadie sospechaba.

### Bug encontrado conduciendo la app, otra vez

> Sin número de BUG-: el catálogo de [02](02-catalogo-bugs.md) inventaría el
> legacy (BUG-001..025) y este es de la v2. Meterlo ahí confundiría «lo que
> heredamos» con «lo que rompimos nosotros».

El arreglo introdujo uno: colapsar el minimapa deja el contenedor a 0 px, y
`drawImage` de un canvas de 0×0 **no es un no-op, es una excepción**. Saltaba en
consola en cada click del toggle. Los 62 E2E pasaban —el minimapa se colapsaba
«bien» y el error no se veía en pantalla— y lo cazó abrir la app y mirarla.

Es la segunda vez en el proyecto (la primera, las vecinas apiladas de la Fase 3).
Mismo patrón: **la suite comprobaba lo que la pieza es, no lo que hace**.

**Causa de fondo: el minimapa (RF-13) se entregó en la Fase 4 sin tests propios.**
Los únicos que lo tocaban eran los de RNF-01, y esos miden fps. Ahora tiene
`tests/e2e/minimap.spec.ts` con 6 casos que comprueban que **pinta** (colores
distintos en el canvas, no `toBeVisible()`: un canvas en blanco supera cualquier
prueba de existencia), que el recuadro sigue al pan, que colapsar no lanza nada,
que tras varios ciclos vuelve a pintar, que un grafo vacío no lo rompe y que el
click navega. Los dos primeros verificados por mutación: reintroducido el bug, la
suite lo caza.

De paso, el caso del recuadro documenta algo que no era evidente: con el grafo
entero a la vista el recuadro cae **fuera** del minimapa (el viewport abarca más
que el grafo), así que el test hace zoom antes de mirar. Sin eso comprobaría un
rectángulo invisible y pasaría siempre.

## Fase 5 — Persistencia y export (est. 1-2 semanas)

- `.excabit.json` v2 + migrador del formato legacy, autosave IndexedDB, export PNG/SVG/CSV.
- **Salida**: round-trip save→load deep-equal; una investigación guardada con la app vieja se abre en la nueva; regresión BUG-019 en verde.

### Resultado (cerrada el 2026-07-16)

| Criterio de salida | Resultado |
|---|---|
| Round-trip save→load deep-equal | ✅ incluidos los bigint (como texto) y un importe mayor que `MAX_SAFE_INTEGER` |
| Una investigación de la app vieja se abre en la nueva | ✅ E2E: `Ctrl+O` con `legacy-save.json` → etiquetas, colores y posiciones, con 5 avisos de lo descartado |
| Regresión BUG-019 | ✅ 14 casos: JSON arbitrario, campos que faltan, tipos cambiados, aristas colgando, `schemaVersion` desconocida |

460 tests unit + 80 E2E. Cobertura de `persistence/`: 96,9 % sentencias · 90,9 % ramas.
**`persistence/` entra en el gate de cobertura** (`vitest.config.ts`): es dominio
puro y guarda el trabajo del usuario — un fallo ahí no se ve hasta que alguien no
puede abrir su fichero.

Decisiones tomadas al implementar:

- **El fichero es autocontenido**: lleva las txs enteras, no solo sus ids. Ocupa
  más, pero abrir una investigación de hace un año no puede depender de que
  mempool.space siga en pie. La lección es de este proyecto: el legacy publicado
  quedó inservible el día que caducó su clave (docs/08, Fase 0). Una investigación
  guardada es un documento, no un puntero. Esto se aparta del extracto de
  docs/05 §3, que no incluía `tx` en los nodos.
- **Cargar devuelve un resultado, no lanza** (`LoadResult`). BUG-019 no era que
  el legacy no validara: era que fallaba *después*, en un `draw()` cualquiera.
  Un tipo que hay que mirar no se puede ignorar sin querer.
- **El autosave guarda el mismo formato que el fichero**: un solo serializador,
  un solo validador, un solo camino que probar. Con dos, «restaurar ≡ round-trip»
  sería una coincidencia que mantener a mano.
- **La selección no se guarda**: es del momento. Restaurar lo que estaba marcado
  al cerrar sería restaurar un accidente.
- **Restaurar es un diálogo, no un toast**: un toast se ignora, y mientras sigue
  en pantalla el autosave de la sesión nueva ya está pisando el que ofrecía
  restaurar. El aviso habría sido más amable que perder el trabajo que anunciaba.
- **Abrir un fichero vacía el historial**: cerrar un documento y abrir otro no es
  editarlo. Un Ctrl+Z que devolviera al grafo anterior mezclaría dos
  investigaciones en una pila.
- **Dos CSV, no uno** (nodos y aristas, con cabeceras `Id`/`Label` y
  `Source`/`Target`): es lo que Gephi importa sin tocar nada (RF-24).
- **El SVG se genera de los datos**, no del lienzo: sale limpio y editable, y de
  paso respeta la frontera (`persistence/` no conoce Cytoscape). El PNG es la
  excepción —es una foto de lo que se ve— y vive en `graph/cy-adapter.ts`.
- **El tema del SVG se inyecta**: copiar los cinco colores en `persistence/`
  sería peor que la regla de fronteras — el día que cambiara un token, el SVG
  seguiría con los colores viejos y nadie se enteraría.
- **Inyección de fórmulas en el CSV**: una etiqueta que empieza por `= + - @` se
  neutraliza con un apóstrofo. Las etiquetas las escribe una persona y las
  investigaciones se comparten: `=HYPERLINK(...)` en el nombre de un nodo se
  ejecuta al abrir el CSV en Excel. No estaba en las specs.
- **zod** (dependencia nueva, la 2ª de producción): docs/05 §3 lo pedía por
  nombre para corregir BUG-019.

**Corrección a docs/05 §3 y al informe del formato legacy — los dos colores del
legacy son estado, no anotaciones.** El migrador empezó copiando `color` a la v2
y salía mal: `color` es el **borde**, y vale `{255,77,77}` cuando el nodo está
*seleccionado* (`exploraGraf.js:790`). Migrarlo convertía en anotación permanente
lo que estuviera marcado al pulsar «guardar». El color del usuario es `bgColor`
(la paleta de 7 botones de `grabaColorTx`, `bchain.js:1556`), y de ahí hay que
excluir dos valores más: `{232,132,32}` es el naranja de «tx expandida»
(`exploraGraf.js:693`) y `{127,127,127}` es el botón 7 = «quitar color». Las
direcciones no tenían paleta (`grabaColorAddr` no existe): su color nunca se
migra. **Lo cazó abrir la app y mirar los colores**, no los 33 tests del migrador
—que pasaban todos, contra un fixture que yo mismo había construido con la
semántica equivocada—. Un fixture inventado prueba lo que creías, no lo que hay.

Otros hallazgos del migrador:

- **El legacy no guardaba las txs**, solo `numVin`/`numVout`/`value`/`fees`. No se
  puede reconstruir una `NormalizedTx` con eso y no se inventa: los nodos migrados
  vienen sin `tx` y se rellenan desde la red, con aviso. Lo irrecuperable eran las
  anotaciones, y esas sí viajan.
- **Las heurísticas guardadas se descartan**, no se migran: son las que
  BUG-006..009 demostraron incorrectas. Migrarlas conservaría el bug con aspecto
  de dato.
- **El legacy no tenía campo de versión** — el `type == "application"` que
  comprobaba `getCargaTx` era el MIME que p5 colgaba del objeto `File`, no algo
  del fichero. Comprobar el envoltorio en vez del contenido es media causa de
  BUG-019. Se reconoce por su forma (`posiTxs` + `posiAddrs`), y por eso v2 lleva
  `schemaVersion` desde el primer día.
- **`{r:256}`**: `grabaColorTx(1)` escribe un canal de 256 (`bchain.js:1561`), que
  no es RGB válido; p5 lo recortaba. El migrador también, o el hex saldría de 7
  dígitos.
- **No había ni un save real en el repo** para usar de fixture (se hosteaban
  aparte, `exploraGraf.js:450`): `tests/fixtures/legacy-save.json` está construido
  a mano desde `saveJSON` (`bchain.js:3640`).

**Regresión introducida y corregida**: el tour (RF-32) ahora aparece después de
consultar el autosave, así que ya no está en el DOM al terminar de cargar. Un E2E
que pulsaba Esc nada más cargar asumía la sincronía de antes y se volvió flaky.
Mismo patrón en dos tests nuevos que pulsaban `Ctrl+O` antes de que el JS
registrara los atajos: `goto` resuelve con el HTML, no con la app viva.

## Fase 6 — Funcionalidades diferenciales (iterativa, una release por feature)

Orden propuesto por valor/esfuerzo:
1. Seguimiento de flujo de fondos (RF-18). ✅ **entregada el 2026-07-16** (ver abajo)
2. Clustering de direcciones (RF-19).
3. Expansión inteligente paginada (RF-31).
4. Línea temporal (P2) y multi-red (RF-04).
5. Export avanzado + enlace permanente (RF-24).
6. Alertas de patrones, modo presentación, comparador (P3).

- **Salida de la 6.1 en adelante**: cada feature con su fila de la matriz de tests completa.
- **Cierre**: deploy en GitHub Pages sustituyendo al legacy; `old/` queda como archivo histórico; README nuevo.

### 6.1 — Seguimiento de flujo de fondos (RF-18), entregada el 2026-07-16

30 tests unit + 7 E2E. Cobertura `analysis/`: 100 % sentencias · 98,1 % ramas.

**Decisión de fondo: haircut, no poison.** La spec pedía «suma acumulada» sin
decir qué pasa cuando una tx mezcla dinero marcado con dinero limpio. Se propaga
**en proporción**: 1 BTC marcado de 4 totales → cada salida al 25 %. La
alternativa (poison: lo que toca queda marcado al 100 %) es más fácil de escribir
y miente más — a los dos o tres saltos tiñe medio grafo. Con haircut, un CoinJoin
5×5 diluye el rastro al 20 %, que es lo que hace en la realidad y lo que esta app
quiere enseñar (docs/00 §3). Consultado y aprobado antes de escribir código.

Decisiones tomadas al implementar:

- **El reparto es sobre lo que SALE, no sobre lo que entra**: la diferencia es la
  comisión, y prorratear sobre las entradas evaporaría un poco del rastro en cada
  salto por un motivo que no tiene que ver con la privacidad. Cuando el marcado
  que entra supera todo lo que sale (justamente por el fee), se acota: una arista
  nunca lleva más marcado que su valor. Lo que sobra se lo llevó el minero.
- **No es un recorrido, es una worklist.** Dos motivos, los dos reales: en un
  diamante los caminos se reencuentran y hay que **sumar** (un BFS con «visitados»
  contaría uno), y una dirección reutilizada (H-07) crea **ciclos** de verdad. Un
  nodo se reencola solo si su marcado crece; como está acotado por el valor de las
  aristas, converge.
- **Un salto es una transacción**, no una arista: pasar por una dirección es el
  mismo dinero esperando a ser gastado.
- **El rastro no toca el modelo**: es una forma de mirar, no una edición. No entra
  en el historial y no hay nada que deshacer. La misma tecla lo quita.
- **Resaltar es apagar**: los nodos fuera del rastro bajan al 18 % de opacidad. El
  grosor del borde lleva la fracción marcada — el mismo dato que el color, dicho
  de una forma que se lee de lejos.
- **Violeta y no naranja**: el naranja ya es la tx raíz, el verde las entradas, el
  rojo las salidas y el azul los UTXO. Reusar cualquiera obligaría a mirar dos
  veces para saber si un nodo está marcado o es que era la raíz.
- **El código muerto se borra, no se cubre con tests.** Al perseguir el umbral de
  ramas de `analysis/` (95 %) aparecieron guardas que no se podían ejecutar: un
  nodo solo entra en la cola si ya tiene marcado y si cabe en `maxHops`, así que
  las comprobaciones de dentro del bucle sobraban. Quitándolas, `taint.ts` pasó de
  88,4 % a 97,6 % de ramas. La cobertura baja no siempre pide más tests; a veces
  señala código que no hace falta.

**Bug preexistente encontrado y corregido — `formatBtc` daba importes ambiguos en
español.** El status del rastro mostraba `0.00240000 BTC` con la app en español.
`formatBtc` agrupaba los miles con el idioma pero ponía el decimal con un punto
fijo, así que un importe grande salía `1.234.567.89012345 BTC`: el mismo signo
como separador de miles y de decimales, y no se sabe dónde acaba el entero. En
una herramienta que sirve para decir cuánto dinero se movió, eso no es estilo.

- **`i18n/format.ts` no tenía ni un test** y estaba fuera del gate de cobertura,
  pese a formatear todos los importes de la app. Ahora tiene 17 y entra en el
  gate. Que `formatFeerate` —en el mismo fichero— ya tradujera el separador
  confirma que fue un olvido, no una decisión.
- El separador lo decide `Intl`, no una tabla nuestra.

**`tPlural` (nuevo, RF-30)**: el resumen decía «1 saltos». Se resuelve con
`Intl.PluralRules` en vez de un `count === 1`, por lo mismo que el separador
decimal: la regla la sabe la plataforma. Las claves se pasan enteras
(`taint.hops.one`, `taint.hops.other`) y no componiendo `${base}.one`, para que
sigan siendo `MessageKey` y el test que caza claves que faltan en los json las vea.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Rate-limit de mempool.space | Caché agresiva (tx confirmadas inmutables) + backoff + posibilidad de nodo Esplora propio (ADR-002) |
| Direcciones con miles de txs | Expansión paginada (RF-31) desde el diseño |
| Layout radial no reproducible en Cytoscape | Spike al abrir Fase 3; única válvula de reapertura de ADR-001 |
| Alcance de Fase 6 crece sin control | Una release por feature; specs antes de código |
