/**
 * Stylesheet de Cytoscape a partir de los tokens del mock aprobado
 * (`mocks/assets/tokens.css`, docs/06).
 *
 * Los valores se declaran aquí como constantes en vez de leerse del CSS porque
 * Cytoscape pinta sobre canvas y no resuelve `var(--x)`. La Fase 4 traerá
 * `ui/theme.css` con los mismos tokens para el shell; esta es la única copia
 * consciente, y por eso los nombres coinciden con los del mock.
 */
import type { StylesheetStyle } from 'cytoscape';

export const TOKENS = {
  bg: '#0d1117',
  surface2: '#1f2630',
  border: '#2d333b',
  text: '#e6edf3',
  textDim: '#8b949e',
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
} as const;

const TX_SIZE = 34;
const ADDRESS_SIZE = 26;

/**
 * `data(color)` deja que el color del usuario (RF-11) gane al del tipo sin
 * duplicar selectores: si no hay color propio, se usa el del token.
 */
export function graphStylesheet(): StylesheetStyle[] {
  return [
    {
      selector: 'node',
      style: {
        'background-color': TOKENS.surface2,
        'border-width': 2,
        'border-color': TOKENS.border,
        label: 'data(label)',
        color: TOKENS.textDim,
        'font-size': 10,
        'text-valign': 'bottom',
        'text-margin-y': 6,
        width: ADDRESS_SIZE,
        height: ADDRESS_SIZE,
      },
    },
    {
      selector: 'node[kind = "tx"]',
      style: { shape: 'round-rectangle', width: TX_SIZE, height: TX_SIZE },
    },
    { selector: 'node[kind = "address"]', style: { shape: 'ellipse' } },
    {
      selector: 'node[kind = "cluster"]',
      style: {
        shape: 'round-rectangle',
        'background-opacity': 0.08,
        'border-style': 'dashed',
        'text-valign': 'top',
      },
    },
    // La tx raíz de la investigación es la referencia visual del radial.
    { selector: 'node[?isRoot]', style: { 'border-color': TOKENS.accent, 'border-width': 3 } },
    { selector: 'node[color]', style: { 'background-color': 'data(color)' } },
    {
      selector: 'node:selected',
      style: { 'border-color': TOKENS.accent, 'border-width': 4, color: TOKENS.text },
    },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'line-color': TOKENS.border,
        'target-arrow-color': TOKENS.border,
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
  ];
}
