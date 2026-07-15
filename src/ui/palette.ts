/**
 * Command palette (RF-26, docs/06 §4).
 *
 * Tercera vía de acceso a toda acción, junto al ratón y el atajo. Es lo que
 * hace la app descubrible sin memorizar nada: el legacy escondía funciones
 * tras teclas mantenidas que no se podían adivinar.
 *
 * **Devuelve el foco al cerrar**: era el bug que se detectó en el mock durante
 * la Fase 0 (docs/09 §27). Sin esto, cerrar con Esc deja el foco en la nada y
 * quien navega por teclado se pierde.
 */
import { paletteActions, formatShortcut, type ActionDefinition, type ActionId } from './actions';
import { t } from '@/i18n/i18n';

export interface PaletteOptions {
  container: HTMLElement;
  onAction: (id: ActionId) => void;
}

export class Palette {
  private readonly container: HTMLElement;
  private readonly onAction: (id: ActionId) => void;
  private overlay: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private list: HTMLUListElement | null = null;
  private matches: ActionDefinition[] = [];
  private index = 0;
  /** A quién se le devuelve el foco al cerrar. */
  private opener: Element | null = null;

  constructor(options: PaletteOptions) {
    this.container = options.container;
    this.onAction = options.onAction;
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

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'paletteOverlay';
    overlay.innerHTML = `
      <div id="paletteBox" role="dialog" aria-modal="true" aria-label="${t('action.palette')}">
        <input id="paletteInput" type="text" role="combobox" aria-expanded="true"
               aria-controls="paletteList" autocomplete="off" placeholder="${t('palette.placeholder')}">
        <ul id="paletteList" role="listbox"></ul>
        <div id="paletteHint">${t('palette.hint')}</div>
      </div>`;

    overlay.addEventListener('mousedown', (event) => {
      // Click fuera cierra; dentro, no.
      if (event.target === overlay) this.close();
    });

    this.container.append(overlay);
    this.overlay = overlay;
    this.input = overlay.querySelector<HTMLInputElement>('#paletteInput');
    this.list = overlay.querySelector<HTMLUListElement>('#paletteList');

    this.input?.addEventListener('input', () => {
      this.filter(this.input?.value ?? '');
    });
    this.input?.addEventListener('keydown', (event) => {
      this.onKeydown(event);
    });

    this.filter('');
    this.input?.focus();
  }

  close(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.input = null;
    this.list = null;

    // Devolver el foco a quien abrió: sin esto, navegar por teclado se rompe.
    if (this.opener instanceof HTMLElement) this.opener.focus();
    this.opener = null;
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.move(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.move(-1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.run();
    }
  }

  private move(delta: number): void {
    if (this.matches.length === 0) return;

    this.index = (this.index + delta + this.matches.length) % this.matches.length;
    this.renderSelection();
  }

  private run(): void {
    const action = this.matches[this.index];
    if (action === undefined) return;

    // Cerrar ANTES de ejecutar: si la acción abre otro diálogo, el foco debe
    // acabar en el nuevo, no volver aquí.
    this.close();
    this.onAction(action.id);
  }

  /** Filtro por subcadena, sin distinguir acentos ni mayúsculas. */
  private filter(query: string): void {
    const needle = normalize(query);
    this.matches = paletteActions().filter((action) =>
      normalize(t(action.i18nKey)).includes(needle),
    );
    this.index = 0;
    this.renderList();
  }

  private renderList(): void {
    if (this.list === null) return;

    this.list.textContent = '';

    if (this.matches.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'muted';
      empty.textContent = t('palette.empty');
      this.list.append(empty);
      return;
    }

    this.matches.forEach((action, i) => {
      const item = document.createElement('li');
      item.role = 'option';
      item.id = `palette-${action.id}`;
      item.dataset['action'] = action.id;
      item.setAttribute('aria-selected', String(i === this.index));

      item.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${action.icon}"/></svg>
        <span>${t(action.i18nKey)}</span>
        ${action.shortcut === undefined ? '' : `<kbd>${formatShortcut(action.shortcut)}</kbd>`}`;

      item.addEventListener('click', () => {
        this.index = i;
        this.run();
      });
      this.list?.append(item);
    });

    this.renderSelection();
  }

  private renderSelection(): void {
    this.list?.querySelectorAll('li[role="option"]').forEach((item, i) => {
      item.setAttribute('aria-selected', String(i === this.index));
    });

    const active = this.matches[this.index];
    if (active !== undefined)
      this.input?.setAttribute('aria-activedescendant', `palette-${active.id}`);
  }
}

/** Sin acentos ni mayúsculas: buscar «etiquetar» debe encontrar «Etiquetar». */
const normalize = (text: string): string => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
