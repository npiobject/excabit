# excabit

**Explorador gráfico y editable de transacciones de Bitcoin.**

Los exploradores de bloques te dan listas y tablas. excabit te da el **grafo**: la
transacción en el centro, sus entradas y salidas alrededor, y tú expandiendo,
moviendo, etiquetando y anotando hasta entender qué pasó.

👉 **[Abrir excabit](https://npiobject.github.io/excabit/)** — sin registro, sin
claves, sin backend.

---

## Qué hace

- **Grafo interactivo**: busca un txid o una dirección y explóralo. Expandir,
  arrastrar, zoom, selección múltiple, deshacer y rehacer.
- **Heurísticas de privacidad explicadas**: nueve heurísticas (H-01…H-09), cada
  una **con su explicación y su nivel de confianza**. Cuando dos se contradicen,
  se ven las dos — no hay veredicto de caja negra.
- **Seguir el flujo de fondos**: marca un nodo y mira a dónde fue el dinero, con
  la suma acumulada y los saltos. Modelo _haircut_: una mezcla **diluye** el
  rastro en vez de teñir medio grafo.
- **Agrupar direcciones** por dueño presunto (CIOH), con la lista de
  transacciones que justifican cada grupo.
- **Línea temporal**: qué se movió entre dos fechas.
- **Guardar y compartir**: fichero `.excabit.json` autocontenido, autoguardado, y
  export a PNG, SVG y CSV (para Excel o Gephi).
- **Español e inglés**, conmutables en caliente.
- **mainnet / testnet / signet**.

Todo es local: las investigaciones se quedan en tu disco o en tu navegador.
excabit no tiene servidores.

## Cómo se usa

Pega un txid (64 caracteres hex) o una dirección de Bitcoin y pulsa Enter. A
partir de ahí:

|                         |                                     |
| ----------------------- | ----------------------------------- |
| `Ctrl` `K`              | Command palette: **todo** está aquí |
| `?`                     | Todos los atajos                    |
| Doble clic en una tx    | Expandir                            |
| `F`                     | Seguir el flujo de fondos           |
| `G`                     | Agrupar direcciones por dueño       |
| `L`                     | Línea temporal                      |
| `Ctrl` `S` / `Ctrl` `O` | Guardar / abrir investigación       |

Toda acción se puede hacer de tres formas —botón, atajo y palette— y todas salen
del mismo registro, así que no pueden divergir.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173
```

| Comando                     | Qué hace                                           |
| --------------------------- | -------------------------------------------------- |
| `npm test`                  | Tests unitarios (Vitest)                           |
| `npm run test:coverage`     | …con el gate de cobertura                          |
| `npm run test:e2e`          | End-to-end contra el build real (Playwright)       |
| `npm run lint`              | ESLint, incluida la regla de fronteras entre capas |
| `npm run typecheck`         | TypeScript en modo estricto                        |
| `npm run build`             | Build de producción                                |
| `npm run analyze -- <txid>` | Heurísticas de una tx real, por consola            |

**546 tests unitarios + 122 E2E.** Los E2E no salen a la red: mempool.space es un
servicio público y gratuito, y no se le cuelga una batería de peticiones en cada
CI.

## Cómo está hecho

TypeScript estricto + Vite + Cytoscape.js. **Sin backend**: es un sitio estático
que lee de la API pública de [mempool.space](https://mempool.space) (Esplora), y
puedes apuntarlo a tu propio nodo.

Las capas están separadas y **la regla la comprueba ESLint**, no la buena
voluntad: `core/`, `data/`, `analysis/` y `persistence/` no conocen Cytoscape ni
el DOM. Se prueban en Node, y el motor del grafo es sustituible tocando un solo
directorio.

```
src/
  core/         tipos, store, comandos con undo, modelo del grafo
  data/         proveedor mempool.space, normalizador, caché, rate limiter
  analysis/     heurísticas, score, taint, clustering, línea temporal
  graph/        la única frontera con Cytoscape
  persistence/  .excabit.json, migrador del legacy, autosave, export
  ui/           shell, panel, palette, toasts, tema
  i18n/         diccionarios y formateo
```

El **método** está en [`docs/`](docs/): especificación antes que código, tests
antes que implementación, y cada requisito con su `RF-XX` trazado a sus tests. El
[roadmap](docs/08-roadmap.md) documenta cada fase — incluido lo que salió mal y
por qué.

## La versión anterior

En [`old/`](old/) vive el excabit de 2022 (p5.js), como archivo histórico. Su
análisis está en [`docs/01`](docs/01-analisis-legacy.md) y sus 25 defectos
catalogados en [`docs/02`](docs/02-catalogo-bugs.md).

No es un ejercicio de escarnio: esa versión es el motivo de esta. Entre otras
cosas, **sus heurísticas llevaban años dando resultados incorrectos** sin que
nadie lo notara (BUG-006…009) — que es exactamente el argumento del enfoque a
prueba primero de la v2. Y quedó inservible el día que caducó su clave de API, la
razón por la que hoy un `.excabit.json` es **autocontenido** y se abre aunque el
proveedor no conteste.

Una investigación guardada con la app antigua **se abre en la nueva**: hay un
migrador que conserva lo que era tuyo (etiquetas, colores, posiciones) y avisa de
lo que no pudo traerse.

## Licencia

MIT.
