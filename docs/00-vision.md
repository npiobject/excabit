---
documento: Visión del producto
proyecto: excabit v2
estado: borrador
version: 0.1
fecha: 2026-07-04
---

# 00 — Visión de excabit

## Qué es

**excabit** (**ex**plorador de la **ca**dena de **bit**coin) es un explorador **gráfico y editable** de transacciones de Bitcoin. A diferencia de los exploradores de bloques convencionales (listas y tablas), excabit representa las transacciones como un **grafo interactivo**: la transacción de estudio en el centro y sus entradas/salidas como nodos conectados, que el usuario expande, mueve, etiqueta, colorea y analiza.

## A quién sirve

| Perfil | Necesidad |
|---|---|
| **Estudiantes y docentes** de Bitcoin | Entender visualmente cómo fluyen los fondos y cómo funcionan las heurísticas de análisis de cadena. |
| **Analistas / investigadores** (forense on-chain) | Seguir flujos de fondos, agrupar direcciones, anotar y documentar investigaciones. |
| **Usuarios conscientes de su privacidad** | Auditar sus propias transacciones: qué patrones revelan y cómo evitarlos. |

## Propuesta de valor

1. **Visual primero**: el grafo es la interfaz, no un complemento.
2. **Editable**: la investigación se construye — etiquetas, colores, notas, eliminación de ramas irrelevantes — y se guarda/comparte.
3. **Pedagógico**: cada heurística de privacidad se muestra con su explicación y nivel de confianza, no como una caja negra.
4. **Soberano y sin fricción**: 100% estático (GitHub Pages), sin registro, sin claves API obligatorias, con proveedor de datos público (mempool.space) y posibilidad de apuntar a un nodo propio (API Esplora autohospedada).

## Principios de diseño

- **Sin backend propio**: la app es un sitio estático; los datos vienen de APIs públicas de blockchain. Ninguna clave ni secreto vive en el repositorio.
- **Privacidad del usuario**: las investigaciones se guardan localmente (fichero / IndexedDB); nada se envía a servidores de excabit (no existen).
- **Descubrible**: toda acción es alcanzable por ratón, por atajo de teclado documentado y por command palette. Nada de teclas mágicas ocultas.
- **Bilingüe**: interfaz en español e inglés desde el primer día (código e identificadores en inglés).
- **Calidad verificable**: desarrollo guiado por especificación (SDD) y por tests (TDD); los requisitos tienen ID y trazan a tests.

## Qué NO es

- No es un explorador de bloques generalista (no lista bloques, mempool, estadísticas de red).
- No es una herramienta de vigilancia comercial tipo Chainalysis: es divulgativa, de código abierto y de análisis puntual.
- No custodia claves ni firma transacciones. Solo lee datos públicos de la cadena.

## Estado actual

La versión legacy (2022, p5.js) vive en `old/` y queda como referencia histórica. Su análisis está en [01-analisis-legacy.md](01-analisis-legacy.md) y sus defectos en [02-catalogo-bugs.md](02-catalogo-bugs.md). La versión 2 se especifica en los documentos 03-08 de esta carpeta.
