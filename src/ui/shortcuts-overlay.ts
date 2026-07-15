/**
 * Overlay de atajos, tecla `?` (RF-27, docs/06 §4).
 *
 * Se genera desde el registro de acciones, así que **no puede mentir**: lista
 * exactamente los atajos que el despachador reconoce. El legacy tenía teclas
 * activas que no estaban documentadas en ningún sitio (y una, `m`, documentada
 * pero muerta).
 */
import { ACTIONS, formatShortcut } from './actions';
import { t } from '@/i18n/i18n';

export class ShortcutsOverlay {
  private readonly container: HTMLElement;
  private overlay: HTMLElement | null = null;
  private opener: Element | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  get isOpen(): boolean {
    return this.overlay !== null;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    if (this.isOpen) return;

    this.opener = document.activeElement;
    // `flatMap` en vez de `filter().map()`: así el tipo se estrecha solo y no
    // hace falta afirmar que el atajo existe.
    const rows = ACTIONS.flatMap((action) =>
      action.shortcut === undefined
        ? []
        : [`<dt>${t(action.i18nKey)}</dt><dd><kbd>${formatShortcut(action.shortcut)}</kbd></dd>`],
    ).join('');

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'shortcutsOverlay';
    overlay.innerHTML = `
      <div id="shortcutsBox" role="dialog" aria-modal="true" aria-label="${t('shortcuts.title')}">
        <h2>${t('shortcuts.title')}</h2>
        <dl>${rows}</dl>
      </div>`;

    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) this.close();
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close();
    });

    this.container.append(overlay);
    this.overlay = overlay;
    overlay.querySelector<HTMLElement>('#shortcutsBox')?.focus();
  }

  close(): void {
    this.overlay?.remove();
    this.overlay = null;

    if (this.opener instanceof HTMLElement) this.opener.focus();
    this.opener = null;
  }
}
