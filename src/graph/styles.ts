/**
 * Stylesheet de Cytoscape: el lenguaje visual del grafo (docs/06 §3).
 *
 * Los tokens son los del mock aprobado (`mocks/assets/tokens.css`). Se declaran
 * aquí como constantes porque Cytoscape pinta sobre canvas y no resuelve
 * `var(--x)`; `ui/theme.css` tiene los mismos valores para el shell. Es la única
 * duplicación consciente, y por eso los nombres coinciden.
 *
 * | Elemento | Representación (docs/06 §3)                        |
 * |----------|----------------------------------------------------|
 * | Tx raíz  | Rect. redondeado, borde --accent, badge de score    |
 * | Tx       | Rect. redondeado --surface-2, id corto + importe    |
 * | Dirección| Nodo circular; arista verde entrada / roja salida   |
 * | UTXO     | Diamante azul --utxo                               |
 * | Cluster  | Compound: halo punteado con nombre                  |
 */
import type { StylesheetStyle } from 'cytoscape';

export const TOKENS = {
  bg: '#0d1117',
  surface: '#161b22',
  surface2: '#1f2630',
  surface3: '#262e39',
  border: '#2d333b',
  text: '#e6edf3',
  textDim: '#8b949e',
  textFaint: '#6e7681',
  /** Naranja Bitcoin: tx raíz y foco. */
  accent: '#f7931a',
  /** Verde: entradas. */
  input: '#3fb950',
  /** Rojo: salidas. */
  output: '#f85149',
  /** Azul: UTXO. */
  utxo: '#58a6ff',
  /** Ámbar: heurística detectada. */
  warn: '#d29922',
  ok: '#3fb950',
  bad: '#f85149',
  /**
   * Violeta: rastro de fondos (RF-18).
   *
   * Un color que no significa nada más en este grafo. El naranja ya es la tx
   * raíz, el verde las entradas, el rojo las salidas y el azul los UTXO: reusar
   * cualquiera obligaría a mirar dos veces para saber si un nodo está marcado o
   * es que resulta que era la raíz.
   */
  taint: '#bc8cff',
} as const;

const FONT_MONO = "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";

export function graphStylesheet(): StylesheetStyle[] {
  return [
    /* ---------- TX: caja con sus datos dentro ---------- */
    {
      selector: 'node[kind = "tx"]',
      style: {
        shape: 'round-rectangle',
        width: 168,
        height: 62,
        'background-color': TOKENS.surface2,
        'border-width': 1,
        'border-color': TOKENS.border,
        // El contenido va en `label` con saltos de línea: Cytoscape pinta en
        // canvas y no admite HTML dentro del nodo.
        label: 'data(display)',
        color: TOKENS.text,
        'font-family': FONT_MONO,
        'font-size': 9,
        'text-wrap': 'wrap',
        'text-valign': 'center',
        'text-halign': 'center',
        'text-margin-y': 2,
        'line-height': 1.45,
        'text-max-width': '150px',
      },
    },
    // El score tiñe el borde: verde ≥80, ámbar 40-79, rojo <40 (docs/04).
    // El color no va solo — el número está dentro del nodo (RNF-05).
    { selector: 'node[scoreBadge = "green"]', style: { 'border-color': TOKENS.ok } },
    { selector: 'node[scoreBadge = "amber"]', style: { 'border-color': TOKENS.warn } },
    { selector: 'node[scoreBadge = "red"]', style: { 'border-color': TOKENS.bad } },
    // Tx raíz: es la referencia del radial, se distingue de un vistazo y su
    // naranja gana al color del score.
    {
      selector: 'node[kind = "tx"][?isRoot]',
      style: { 'border-width': 2, 'border-color': TOKENS.accent },
    },

    /* ---------- DIRECCIÓN: círculo con etiqueta e importe ---------- */
    {
      selector: 'node[kind = "address"]',
      style: {
        shape: 'ellipse',
        width: 34,
        height: 34,
        'background-color': TOKENS.surface3,
        'border-width': 2,
        'border-color': TOKENS.border,
        label: 'data(display)',
        color: TOKENS.textDim,
        'font-family': FONT_MONO,
        'font-size': 9,
        'text-wrap': 'wrap',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 5,
        'line-height': 1.4,
      },
    },
    // Dirección reutilizada: es la señal de privacidad más fuerte (H-07).
    {
      selector: 'node[kind = "address"][?reused]',
      style: { 'border-color': TOKENS.warn, 'border-style': 'dashed' },
    },
    /* ---------- UTXO: diamante azul ---------- */
    {
      selector: 'node[kind = "address"][?isUtxo]',
      style: {
        shape: 'diamond',
        width: 30,
        height: 30,
        'border-color': TOKENS.utxo,
        'background-color': TOKENS.surface2,
      },
    },

    /* ---------- CLUSTER ---------- */
    {
      selector: 'node[kind = "cluster"]',
      style: {
        shape: 'round-rectangle',
        'background-color': TOKENS.accent,
        'background-opacity': 0.05,
        'border-width': 1,
        'border-color': TOKENS.accent,
        'border-style': 'dashed',
        label: 'data(label)',
        color: TOKENS.textDim,
        'font-size': 10,
        'text-valign': 'top',
        'text-margin-y': -4,
        padding: '18px',
      },
    },

    /* ---------- Color del usuario (RF-11): gana al del tipo ---------- */
    { selector: 'node[color]', style: { 'background-color': 'data(color)' } },

    /* ---------- Selección ---------- */
    {
      selector: 'node:selected',
      style: { 'border-width': 3, 'border-color': TOKENS.accent, color: TOKENS.text },
    },

    /* ---------- ARISTAS ---------- */
    {
      selector: 'edge',
      style: {
        width: 1.5,
        // Curvas como en el mock: con varias aristas entre los mismos nodos, las
        // rectas se solaparían y no se sabría cuántas hay.
        'curve-style': 'bezier',
        'control-point-step-size': 50,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.75,
        'line-color': TOKENS.border,
        'target-arrow-color': TOKENS.border,
        label: 'data(display)',
        color: TOKENS.textFaint,
        'font-family': FONT_MONO,
        'font-size': 8,
        'text-rotation': 'autorotate',
        'text-background-color': TOKENS.bg,
        'text-background-opacity': 0.85,
        'text-background-padding': '2px',
      },
    },
    {
      selector: 'edge[kind = "input"]',
      style: { 'line-color': TOKENS.input, 'target-arrow-color': TOKENS.input },
    },
    {
      selector: 'edge[kind = "output"]',
      style: { 'line-color': TOKENS.output, 'target-arrow-color': TOKENS.output },
    },
    // Un UTXO es dinero sin gastar: se ve de un vistazo (RF-05).
    {
      selector: 'edge[?isUtxo]',
      style: {
        'line-color': TOKENS.utxo,
        'target-arrow-color': TOKENS.utxo,
        'line-style': 'dashed',
      },
    },
    { selector: 'edge:selected', style: { 'line-color': TOKENS.accent, width: 2.5 } },

    /* ---------- Rastro de fondos (RF-18) ---------- */

    /*
     * Resaltar un camino es, sobre todo, apagar lo que no lo es. Un 0,18 de
     * opacidad deja el resto del grafo como contexto —se ve dónde está el rastro
     * dentro de la investigación— sin competir por la atención.
     */
    // Dos filtros, una misma forma de apagar: el rastro (RF-18) y el rango de
    // fechas (RF-35). Con clases distintas se combinan sin pisarse — quitar el
    // rastro no devuelve a la vista lo que el rango esconde.
    { selector: '.dimmed', style: { opacity: 0.18 } },
    { selector: '.outOfRange', style: { opacity: 0.18 } },
    {
      selector: 'node.tainted',
      style: {
        'border-color': TOKENS.taint,
        // El grosor del borde lleva la fracción marcada: un nodo por el que pasó
        // todo el dinero se ve más que uno que recibió un 5 % tras una mezcla.
        // Es el mismo dato que el color, dicho de una forma que se lee de lejos.
        'border-width': `mapData(taint, 0, 1, 2, 6)`,
        'border-opacity': 1,
      },
    },
    {
      selector: 'edge.tainted',
      style: {
        'line-color': TOKENS.taint,
        'target-arrow-color': TOKENS.taint,
        width: 3,
        'line-style': 'solid',
      },
    },
  ];
}
