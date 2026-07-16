---
documento: Catálogo de bugs e inconsistencias del legacy
proyecto: excabit v2
estado: borrador
version: 0.1
fecha: 2026-07-04
---

# 02 — Catálogo de bugs e inconsistencias (`old/`)

Severidades: **S1** crítico (seguridad / corrupción de datos), **S2** funcional (comportamiento incorrecto observable), **S3** latente (funciona de rebote o degrada con el uso), **S4** mantenibilidad.

Columna «¿v2?»: qué exige del nuevo diseño (test de regresión, decisión de arquitectura, o n/a si el diseño lo elimina de raíz).

## Seguridad

| ID | Sev. | Dónde | Descripción | ¿v2? |
|---|---|---|---|---|
| BUG-001 | S1 | `old/clases/conex.js:15-16` | Dos claves API de NowNodes hardcodeadas en el cliente y publicadas en un repo/página públicos. **Verificado el 2026-07-05: la clave activa devuelve `401 Unknown API_key` (caducada), así que el riesgo residual es nulo — pero la consecuencia es que la app legacy publicada está inoperativa: NowNodes es su única fuente de datos** (llamadas en `bchain.js:80,120,266`). El patrón (secretos en cliente) sigue siendo el defecto a no repetir. **Purgadas de toda la historia de git el 2026-07-16** (`git filter-repo`) al publicar el repo v2: ya no aparecen en ningún commit, solo el marcador `CLAVE-REVOCADA-VER-BUG-001`. | ADR-002: proveedor sin clave por defecto; CI con gitleaks impide reincidir |

## Red y caché (`conex.js`)

| ID | Sev. | Dónde | Descripción | ¿v2? |
|---|---|---|---|---|
| BUG-002 | S3 | `conex.js:43-59` | `datos = response.json()` sin `await` dentro del `.then`: la caché `datosTxNN` almacena **Promises** en vez de datos. Funciona de rebote porque los consumidores hacen `await` sobre el valor devuelto (aplana la promesa), pero todo lector síncrono de la caché recibiría una Promise. Además no se comprueba `response.ok`. | Test de caché: "lo cacheado es un objeto plano, no thenable"; contrato ApiClient exige comprobar `ok` |
| BUG-003 | S3 | `conex.js:68-74, 102-108` | Doble `.catch()` encadenado: el segundo nunca recibe error (el primero ya lo consumió). El primero hace `alert(error)` — error de red = popup bloqueante. | Política de errores: nunca `alert`; errores tipados + toast |
| BUG-004 | S3 | `conex.js:64-96` | `getAddrNN` no cachea (el push a `datosAddrNN` está comentado); cada consulta de dirección repite el fetch. La caché de UTXOs tampoco existe. | Caché normalizada tx+addr+utxo con TTL y límite de entradas |
| BUG-005 | S4 | `conex.js:46,70,104` | El cliente HTTP manipula la UI (`divGifAnimado.show()`): capa de red acoplada a la presentación. Además `show()` se llama al recibir respuesta (no al iniciar), con lo que el "downloading..." aparece tarde. | Arquitectura: `data/` no importa DOM; estados de carga en el store |

## Heurísticas (`heuristic.js`)

| ID | Sev. | Dónde | Descripción | ¿v2? |
|---|---|---|---|---|
| BUG-006 | S2 | `heuristic.js:57-75, 117-135` | Se comparan resultados de `tipoDeDireccion()` (devuelve números 1/2/3) con `tipoDirecBc1()` (devuelve strings 'bc1q'/'bc1p'/0) en condiciones `(a != x) && (a != y)`: la guarda "todas las direcciones del mismo tipo" acepta/rechaza combinaciones que no debería. En `salidaMontoMayor` el bucle de validación de inputs itera `lengInputs` pero solo tiene sentido con 1 input (ya filtrado), y el de outputs compara contra un tipo calculado con la función equivocada. | `address-type.ts` único con enum tipado; vectores de test por tipo de dirección (P2PKH, P2SH, bech32 v0 42/62 chars, taproot) |
| BUG-007 | S2 | `heuristic.js:148` | `entradaInnecesaria`: `this.inputs[i].addresses[0].value` accede a `.value` de un **string** (la dirección) → `undefined`; `undefined < satsOutMin` es siempre false → la guarda nunca corta y la heurística devuelve `true` en casos donde no aplica (falsos positivos). El código correcto (comentado en la línea 147) usaba `prev_out.value`; en la API de NowNodes el campo es `vin[i].value`. | Vector de test: tx de 2 inputs donde un input < min(outputs) debe dar `false` |
| BUG-008 | S2 | `heuristic.js:367-368` | `pagoNumeroRedondo`: `if ((A && B) || C && D)` — falta paréntesis en la segunda rama; con `lengOut == 1` y `numOutConCeros == 0` la expresión evalúa la rama C&&D de forma no pretendida. | Vectores de test con 1 y N salidas, con y sin ceros |
| BUG-009 | S2 | `heuristic.js:23-32` | `versionesDeTxs()` es un stub (calcula longitudes y devuelve siempre `false`) pero se lista como heurística en la UI: el usuario ve un "resultado" que no evalúa nada. | La v2 la especifica de verdad (comparar `version` 1/2 y `locktime`) o no la muestra |
| BUG-010 | S3 | `heuristic.js:185-187` | `pagoADirScripDif` hace `console.log` de diagnóstico en producción cuando la longitud de dirección no es 42/62; además ignora bech32m/taproot (62 chars también en bc1p). | Logging solo en dev; casos límite en vectores de test |
| BUG-011 | S3 | `heuristic.js` (global) | Las heurísticas mutan estado de instancia compartida (`this.inputs`, `this.out`, `this.esOk`) en vez de ser funciones puras: llamadas entrelazadas se pisan el estado. | Heurísticas como funciones puras `(tx) => HeuristicResult` |

## Núcleo p5 / estado (`exploraGraf.js`, `bchain.js`, `canvas.js`)

| ID | Sev. | Dónde | Descripción | ¿v2? |
|---|---|---|---|---|
| BUG-012 | S2 | `exploraGraf.js:11` | `let dimCanvas_0 = dimCanvas;` — alias, no copia: `Canvas.putCanvas_0()` y `putCanvas()` escriben sobre el MISMO objeto; las dimensiones de la pantalla de entrada se corrompen al crear el canvas de trabajo. | n/a (diseño lo elimina); recordatorio: copias explícitas (`structuredClone`) |
| BUG-013 | S2/S3 | `exploraGraf.js:244-245, 1341-1350` | Undo: `mousePressed()` hace `saveState()` en **cada click** guardando una imagen completa del canvas (`get()`) en un array sin límite → crecimiento de memoria ilimitado en sesiones largas. Además `undoToPreviousState()` solo repinta la imagen: los datos (`posiTxs`…) no se revierten → el siguiente redibujado restaura el estado "deshecho". `loadPixels()` se llama sin usarse. | Undo/redo por comandos sobre datos; test: 100 undos sin crecimiento de memoria y con datos coherentes |
| BUG-014 | S3 | `exploraGraf.js:465` | `async function draw()` — p5 no espera promesas de `draw`; los `await` internos solapan frames (condiciones de carrera entre descarga y render). | Datos asíncronos fuera del bucle de render; el grafo se actualiza por eventos del store |
| BUG-015 | S3 | `exploraGraf.js:883-889` | Zoom: `}if (e.deltaY == 0){` — falta `else`; estilo aparte, un `deltaY` 0 desactiva un zoom ya encolado. El zoom reescala **todas las posiciones y tamaños** en vez de transformar la vista → acumula error de redondeo (`int()`) y deriva el layout con cada rueda. | Zoom/pan como transformación de viewport (nativo en Cytoscape), nunca mutando el modelo |
| BUG-016 | S2 | `exploraGraf.js:656-716` | Doble click sobre "Multi Tx": rama a medio implementar, solo `console.log` (la edición/selección de multi-tx nunca se hizo). | RF de expansión paginada sustituye al concepto Multi Tx |
| BUG-017 | S3 | `exploraGraf.js:769-1059` | 12 `window.addEventListener` (6 de "click") con guardas por teclas; se registran una vez pero sus condiciones se solapan (p.ej. shift+click selecciona Y arranca área en mousedown). `mouseReleased` de p5 duplica el listener nativo "mouseup". | Gestor de interacciones único con máquina de estados |
| BUG-018 | S3 | `exploraGraf.js:913` (`txtTag`) | Asignación a global implícita `txtTag` (nunca declarada): rompería en strict mode / módulos ES. | TypeScript strict lo hace imposible |
| BUG-019 | S3 | `exploraGraf.js:1135-1196` (getCargaTx) | Carga de JSON sin validación de esquema: cualquier JSON con `type == "application"` se vuelca a las estructuras internas (crash diferido si faltan campos). Errores con `alert`. | Schema versionado + validación al importar, con mensaje de error claro |
| BUG-020 | S4 | `exploraGraf.js` (global) | ~60 variables globales mutables como única "arquitectura de estado"; 20+ flags-semáforo sondeados por `draw()`. | Store único con eventos |
| BUG-021 | S4 | `bchain.js` (3.728 líneas) | Clase-dios: red+modelo+layout+render+UI (crea 47 elementos DOM)+vídeo+persistencia. Métodos muertos: `kk_recalculaTodosTxsAddrs`, `No_utilizada_indexArbolPosi`, `No_habilitada_contenidoOpciones`, `V_2_intersecionTxs`, `V_2_recalculaAddrParaIntersec`. | Módulos con responsabilidad única (spec técnica §2) |
| BUG-022 | S4 | `exploraGraf.js:386-399, 1152-1163…` | Ocultación de elementos moviéndolos a `position(-20000,-20000)` y "pantallas" simuladas moviendo elementos; imposible de razonar y de testear. | UI declarativa con estados visible/oculto reales |
| BUG-023 | S4 | `old/index.html:7` | Se sirve `p5.js` completo (4,3 MB) en vez de `p5.min.js` (823 KB), que está descargado al lado y comentado. | Bundle Vite con tree-shaking; presupuesto de peso en CI |
| BUG-024 | S3 | `bchain.js:2146`, `exploraGraf.js:998-1002` | Lógica de "imprimir PNG" duplicada (tecla `p` y botón), con formatos de fecha construidos a mano ligeramente distintos. | Una sola acción `export.png` invocable desde palette/atajo/botón |
| BUG-025 | S3 | `exploraGraf.js:219-226` | El txid inicial se reasigna 4 veces seguidas (historia de pruebas fosilizada); valor efectivo poco obvio. | Config de ejemplo explícita |

## Resumen

- 1 bug crítico de seguridad (BUG-001), **cerrado**: las claves estaban caducadas (verificado el 2026-07-05) y el 2026-07-16 se purgaron de toda la historia de git antes de publicar la v2.
- 6 bugs funcionales visibles (BUG-006..009, 012, 013, 016): sobre todo, **las heurísticas llevan años dando resultados parcialmente incorrectos** sin que nadie lo detectara — el argumento más fuerte a favor del enfoque TDD de la v2 ([07-plan-de-tests.md](07-plan-de-tests.md)).
- El resto son deudas estructurales que la arquitectura de [05-especificacion-tecnica.md](05-especificacion-tecnica.md) elimina por diseño.
