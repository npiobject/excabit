import { describe, it, expect } from 'vitest';
import {
  ACTIONS,
  actionById,
  paletteActions,
  toolbarActions,
  formatShortcut,
  shortcutOf,
} from '@/ui/actions';
import es from '@/i18n/es.json';

describe('RF-26/27 — registro único de acciones', () => {
  it('no hay dos acciones con el mismo atajo', () => {
    const shortcuts = ACTIONS.map((action) => action.shortcut).filter((s) => s !== undefined);
    const duplicated = shortcuts.filter((s, i) => shortcuts.indexOf(s) !== i);

    expect(duplicated).toEqual([]);
  });

  it('no hay dos acciones con el mismo id', () => {
    const ids = ACTIONS.map((action) => action.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toda acción registrada tiene i18nKey e icono', () => {
    for (const action of ACTIONS) {
      expect(action.i18nKey, `${action.id} sin i18nKey`).toBeTruthy();
      expect(action.icon, `${action.id} sin icono`).toBeTruthy();
    }
  });

  it('toda i18nKey existe en el diccionario', () => {
    const keys = new Set(Object.keys(es));

    for (const action of ACTIONS) {
      expect(keys, `falta traducción de ${action.id}`).toContain(action.i18nKey);
    }
  });

  it('RF-26: toda acción es alcanzable por atajo o por la palette', () => {
    // La promesa es que nada quede escondido tras una tecla mágica sin
    // documentar, como los `d+click`/`alt+click` del legacy.
    for (const action of ACTIONS) {
      const reachable =
        action.shortcut !== undefined ||
        action.hiddenInPalette !== true ||
        action.inToolbar === true;

      expect(reachable, `${action.id} no es alcanzable`).toBe(true);
    }
  });

  it('las acciones de la toolbar tienen icono y atajo (el tooltip los muestra)', () => {
    for (const action of toolbarActions()) {
      expect(action.icon).toBeTruthy();
      expect(action.shortcut, `${action.id} en toolbar sin atajo`).toBeDefined();
    }
  });

  it('la palette lista todas las acciones menos las ocultas a propósito', () => {
    const hidden = ACTIONS.filter((a) => a.hiddenInPalette === true).map((a) => a.id);

    expect(paletteActions().map((a) => a.id)).toEqual(
      ACTIONS.filter((a) => !hidden.includes(a.id)).map((a) => a.id),
    );
    // Buscar «paleta» dentro de la paleta no lleva a ningún sitio.
    expect(hidden).toContain('palette');
  });

  it('el overlay ? lista exactamente las acciones con atajo', () => {
    const withShortcut = ACTIONS.filter((a) => a.shortcut !== undefined);

    expect(withShortcut.length).toBeGreaterThan(10);
    for (const action of withShortcut) {
      expect(formatShortcut(action.shortcut!)).toBeTruthy();
    }
  });

  it('actionById encuentra por id y no inventa acciones', () => {
    expect(actionById('undo')?.shortcut).toBe('ctrl+z');
    // @ts-expect-error id inexistente a propósito
    expect(actionById('no-existe')).toBeUndefined();
  });

  it('los atajos del doc 06 §4 están registrados', () => {
    const expected: Record<string, string> = {
      undo: 'ctrl+z',
      redo: 'ctrl+y',
      palette: 'ctrl+k',
      shortcuts: '?',
      fit: '0',
      label: 't',
      color: 'c',
      delete: 'delete',
      followFunds: 'f',
      cluster: 'g',
      export: 'e',
      save: 'ctrl+s',
      open: 'ctrl+o',
      search: '/',
    };

    for (const [id, shortcut] of Object.entries(expected)) {
      expect(ACTIONS.find((a) => a.id === id)?.shortcut, `atajo de ${id}`).toBe(shortcut);
    }
  });
});

describe('shortcutOf — normalización del teclado (BUG-017)', () => {
  const event = (init: Partial<KeyboardEvent>) => init as KeyboardEvent;

  it('normaliza teclas simples a minúsculas', () => {
    expect(shortcutOf(event({ key: 'T' }))).toBe('t');
    expect(shortcutOf(event({ key: 'c' }))).toBe('c');
  });

  it('normaliza combinaciones con ctrl', () => {
    expect(shortcutOf(event({ key: 'z', ctrlKey: true }))).toBe('ctrl+z');
    expect(shortcutOf(event({ key: 'K', ctrlKey: true }))).toBe('ctrl+k');
  });

  it('trata metaKey como ctrl (macOS)', () => {
    expect(shortcutOf(event({ key: 'z', metaKey: true }))).toBe('ctrl+z');
  });

  it('mantiene shift cuando aporta', () => {
    expect(shortcutOf(event({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe('ctrl+shift+z');
  });

  it('? no se declara como shift+?: ya llega con shift pulsado', () => {
    expect(shortcutOf(event({ key: '?', shiftKey: true }))).toBe('?');
  });

  it('teclas especiales', () => {
    expect(shortcutOf(event({ key: 'Delete' }))).toBe('delete');
    expect(shortcutOf(event({ key: 'Enter' }))).toBe('enter');
    expect(shortcutOf(event({ key: ' ' }))).toBe('space');
  });
});

describe('formatShortcut — presentación', () => {
  it('formatea para humanos', () => {
    expect(formatShortcut('ctrl+z')).toBe('Ctrl+Z');
    expect(formatShortcut('delete')).toBe('Supr');
    expect(formatShortcut('t')).toBe('T');
    expect(formatShortcut('?')).toBe('?');
    expect(formatShortcut('ctrl+shift+z')).toBe('Ctrl+Shift+Z');
  });
});
