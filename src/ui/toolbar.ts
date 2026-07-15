/**
 * Toolbar izquierda (docs/06 §2).
 *
 * Se genera desde el registro de acciones: los iconos, los tooltips y los
 * atajos que muestra salen de ahí, así que no pueden desincronizarse de la
 * palette ni del overlay de atajos (RF-26).
 */
import { toolbarActions, formatShortcut, type ActionId } from './actions';
import { t } from '@/i18n/i18n';

export interface ToolbarOptions {
  container: HTMLElement;
  onAction: (id: ActionId) => void;
}

export class Toolbar {
  private readonly container: HTMLElement;
  private readonly onAction: (id: ActionId) => void;

  constructor(options: ToolbarOptions) {
    this.container = options.container;
    this.onAction = options.onAction;
    this.render();
  }

  render(): void {
    this.container.textContent = '';

    for (const action of toolbarActions()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset['action'] = action.id;
      // El tooltip lleva el atajo: descubrir la acción y aprender su atajo es
      // el mismo gesto (RF-26/27).
      button.dataset['tip'] =
        action.shortcut === undefined
          ? t(action.i18nKey)
          : `${t(action.i18nKey)} · ${formatShortcut(action.shortcut)}`;
      button.setAttribute('aria-label', t(action.i18nKey));

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('class', 'icon');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', action.icon);
      svg.append(path);
      button.append(svg);

      button.addEventListener('click', () => {
        this.onAction(action.id);
      });
      this.container.append(button);
    }
  }

  /** Desactiva lo que no aplica sin selección: el estado se ve, no se adivina. */
  setSelectionCount(count: number): void {
    for (const action of toolbarActions()) {
      if (action.needsSelection !== true) continue;

      const button = this.container.querySelector<HTMLButtonElement>(
        `[data-action="${action.id}"]`,
      );
      if (button !== null) button.disabled = count === 0;
    }
  }
}
