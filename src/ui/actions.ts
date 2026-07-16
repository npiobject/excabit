/**
 * Registro único de acciones (RF-26/27, docs/06 §4).
 *
 * **Toda** acción de la app se declara aquí una vez, con su atajo, su icono y
 * su clave de traducción. De este registro salen solos: la toolbar, la command
 * palette, el overlay de atajos y el despachador de teclado. Añadir una acción
 * = añadir una fila.
 *
 * Es la respuesta a dos defectos del legacy:
 *
 * - **BUG-017**: 12 `addEventListener` con guardas por teclas que se solapaban
 *   entre sí. Aquí el teclado se resuelve en un único punto contra este registro.
 * - Los modos por tecla mantenida (`d+click`, `i+click`, `alt+click`) eran
 *   indetectables: no se podían descubrir, no estaban documentados y chocaban
 *   con atajos del navegador (docs/06 §4). Desaparecen.
 *
 * Invariante que los tests hacen cumplir: no hay dos acciones con el mismo
 * atajo, y toda acción tiene i18nKey e icono.
 */
import type { MessageKey } from '@/i18n/i18n';

export type ActionId =
  | 'search'
  | 'expand'
  | 'label'
  | 'color'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'fit'
  | 'zoomIn'
  | 'zoomOut'
  | 'followFunds'
  | 'cluster'
  | 'export'
  | 'exportSvg'
  | 'exportCsv'
  | 'save'
  | 'open'
  | 'palette'
  | 'shortcuts'
  | 'toggleTimeline'
  | 'toggleMinimap'
  | 'togglePanel'
  | 'toggleLanguage';

export interface ActionDefinition {
  id: ActionId;
  /** Clave i18n del nombre visible. */
  i18nKey: MessageKey;
  /**
   * Atajo en notación canónica: modificadores en orden `ctrl+shift+alt+tecla`,
   * tecla en minúsculas. `undefined` = sin atajo.
   */
  shortcut?: string;
  /** Icono SVG inline (path). La app no depende de una fuente de iconos. */
  icon: string;
  /** Aparece en la toolbar izquierda, en este orden. */
  inToolbar?: boolean;
  /** Se oculta de la palette (p. ej. la propia palette). */
  hiddenInPalette?: boolean;
  /** Requiere que haya algo seleccionado. */
  needsSelection?: boolean;
}

/* Iconos: trazos simples de 24×24, `currentColor`. */
const ICONS = {
  search:
    'M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
  expand: 'M4 4h7v2H6v5H4V4zm9 0h7v7h-2V6h-5V4zM4 13h2v5h5v2H4v-7zm14 0h2v7h-7v-2h5v-5z',
  label: 'M4 4h9l7 8-7 8H4V4zm2 2v12h6.1l5.3-6-5.3-6H6zm2 5h6v2H8v-2z',
  color:
    'M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1.1.9-2 2-2h2.5A5.5 5.5 0 0 0 23 9c0-3.9-4.9-6-11-6zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm4 3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
  delete:
    'M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 9zm3 2v8h2v-8H9zm4 0v8h2v-8h-2z',
  undo: 'M8 5 3 10l5 5v-3.5h5A4.5 4.5 0 0 1 13 20h-2v2h2a6.5 6.5 0 1 0 0-13H8V5z',
  redo: 'm16 5 5 5-5 5v-3.5h-5A4.5 4.5 0 0 0 11 20h2v2h-2a6.5 6.5 0 1 1 0-13h5V5z',
  fit: 'M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z',
  zoomIn:
    'M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm-1 2v2H8v2h2v2h2v-2h2v-2h-2V8h-2z',
  zoomOut:
    'M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM8 10v2h6v-2H8z',
  followFunds: 'M3 12h4l3-7 4 14 3-7h4v2h-2.8l-4.2 9.6L9.3 9.6 7.8 14H3v-2z',
  cluster:
    'M7 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm10 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM7 14a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm10 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  export: 'M12 3l4 4h-3v7h-2V7H8l4-4zM4 17h16v2H4v-2z',
  save: 'M5 3h11l3 3v15H5V3zm2 2v5h8V5H7zm0 8v6h10v-6H7z',
  open: 'M3 5h6l2 2h10v12H3V5zm2 2v10h14V9h-8.8l-2-2H5z',
  palette: 'M4 4h16v16H4V4zm2 2v12h12V6H6zm2 3h5v2H8V9zm0 4h8v2H8v-2z',
  shortcuts:
    'M4 6h16v12H4V6zm2 2v8h12V8H6zm1 1h2v2H7V9zm3 0h2v2h-2V9zm3 0h2v2h-2V9zm3 0h1v2h-1V9zM7 12h2v2H7v-2zm3 0h7v2h-7v-2z',
  minimap: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z',
  timeline:
    'M3 11h18v2H3v-2zm4-4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm10 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM3 4h18v2H3V4zm0 14h18v2H3v-2z',
  panel: 'M3 4h18v16H3V4zm2 2v12h9V6H5zm11 0v12h3V6h-3z',
  language:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2c1.2 0 2.6 2 3.1 5H8.9C9.4 7 10.8 5 12 5zM5.3 10h2.4a19 19 0 0 0 0 4H5.3a7 7 0 0 1 0-4zm4.4 0h4.6a17 17 0 0 1 0 4H9.7a17 17 0 0 1 0-4zm6.6 0h2.4a7 7 0 0 1 0 4h-2.4a19 19 0 0 0 0-4zM12 19c-1.2 0-2.6-2-3.1-5h6.2c-.5 3-1.9 5-3.1 5z',
} as const;

/**
 * El catálogo. El orden importa: es el de la toolbar y el de la palette.
 * Los atajos salen de la tabla de docs/06 §4.
 */
export const ACTIONS: readonly ActionDefinition[] = [
  { id: 'search', i18nKey: 'action.search', shortcut: '/', icon: ICONS.search },
  {
    id: 'expand',
    i18nKey: 'action.expand',
    shortcut: 'enter',
    icon: ICONS.expand,
    inToolbar: true,
    needsSelection: true,
  },
  {
    id: 'label',
    i18nKey: 'action.label',
    shortcut: 't',
    icon: ICONS.label,
    inToolbar: true,
    needsSelection: true,
  },
  {
    id: 'color',
    i18nKey: 'action.color',
    shortcut: 'c',
    icon: ICONS.color,
    inToolbar: true,
    needsSelection: true,
  },
  {
    id: 'delete',
    i18nKey: 'action.delete',
    shortcut: 'delete',
    icon: ICONS.delete,
    inToolbar: true,
    needsSelection: true,
  },
  {
    id: 'followFunds',
    i18nKey: 'action.followFunds',
    shortcut: 'f',
    icon: ICONS.followFunds,
    inToolbar: true,
    needsSelection: true,
  },
  {
    id: 'cluster',
    i18nKey: 'action.cluster',
    shortcut: 'g',
    icon: ICONS.cluster,
    inToolbar: true,
    // **Sin `needsSelection`** (lo tenía al declararse en la Fase 4, antes de
    // implementarla): en RF-19 quien agrupa es la heurística, no el usuario. No
    // hay nada que seleccionar antes de saber qué direcciones firman juntas —
    // eso es justo lo que la acción viene a averiguar. Con un cluster
    // seleccionado, la misma tecla lo deshace.
  },
  { id: 'fit', i18nKey: 'action.fit', shortcut: '0', icon: ICONS.fit, inToolbar: true },
  // Tres formatos, tres acciones (RF-26). Un botón «exportar» que abre un menú
  // sería una cuarta forma de interacción que no está en el registro y que ni la
  // palette ni el teclado sabrían alcanzar. En la toolbar solo va el PNG: es el
  // caso común (RF-23 es P1; el CSV de RF-24 es P2), y los otros dos están a un
  // Ctrl+K de distancia.
  { id: 'export', i18nKey: 'action.export', shortcut: 'e', icon: ICONS.export, inToolbar: true },
  { id: 'exportSvg', i18nKey: 'action.exportSvg', icon: ICONS.export },
  { id: 'exportCsv', i18nKey: 'action.exportCsv', icon: ICONS.export },
  { id: 'undo', i18nKey: 'action.undo', shortcut: 'ctrl+z', icon: ICONS.undo },
  { id: 'redo', i18nKey: 'action.redo', shortcut: 'ctrl+y', icon: ICONS.redo },
  { id: 'zoomIn', i18nKey: 'action.zoomIn', shortcut: '+', icon: ICONS.zoomIn },
  { id: 'zoomOut', i18nKey: 'action.zoomOut', shortcut: '-', icon: ICONS.zoomOut },
  { id: 'save', i18nKey: 'action.save', shortcut: 'ctrl+s', icon: ICONS.save },
  { id: 'open', i18nKey: 'action.open', shortcut: 'ctrl+o', icon: ICONS.open },
  {
    id: 'palette',
    i18nKey: 'action.palette',
    shortcut: 'ctrl+k',
    icon: ICONS.palette,
    // Buscar «paleta» dentro de la paleta no lleva a ningún sitio.
    hiddenInPalette: true,
  },
  { id: 'shortcuts', i18nKey: 'action.shortcuts', shortcut: '?', icon: ICONS.shortcuts },
  { id: 'toggleTimeline', i18nKey: 'action.toggleTimeline', shortcut: 'l', icon: ICONS.timeline },
  { id: 'toggleMinimap', i18nKey: 'action.toggleMinimap', shortcut: 'm', icon: ICONS.minimap },
  { id: 'togglePanel', i18nKey: 'action.togglePanel', shortcut: ']', icon: ICONS.panel },
  { id: 'toggleLanguage', i18nKey: 'action.toggleLanguage', icon: ICONS.language },
];

export const toolbarActions = (): ActionDefinition[] =>
  ACTIONS.filter((action) => action.inToolbar === true);

export const paletteActions = (): ActionDefinition[] =>
  ACTIONS.filter((action) => action.hiddenInPalette !== true);

export const actionById = (id: ActionId): ActionDefinition | undefined =>
  ACTIONS.find((action) => action.id === id);

/**
 * Normaliza un evento de teclado a la notación de `shortcut`.
 * Un único sitio donde se decide qué tecla es qué (BUG-017).
 */
export function shortcutOf(event: KeyboardEvent): string {
  const key = event.key === ' ' ? 'space' : event.key.toLowerCase();

  // `?` ya llega con shift pulsado en cualquier distribución: declararlo como
  // 'shift+?' sería redundante y no casaría nunca.
  if (key === '?') return '?';

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('ctrl');
  if (event.shiftKey) parts.push('shift');
  if (event.altKey) parts.push('alt');
  parts.push(key);

  return parts.join('+');
}

/** Presentación del atajo para la UI: `ctrl+z` → `Ctrl+Z`. */
export function formatShortcut(shortcut: string): string {
  const NAMES: Record<string, string> = {
    ctrl: 'Ctrl',
    shift: 'Shift',
    alt: 'Alt',
    enter: 'Enter',
    delete: 'Supr',
    space: 'Espacio',
  };

  return shortcut
    .split('+')
    .map((part) => NAMES[part] ?? (part.length === 1 ? part.toUpperCase() : part))
    .join('+');
}
