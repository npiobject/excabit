/**
 * Toasts (RF-29, docs/06 §6).
 *
 * **BUG-003**: el legacy hacía `alert(error)` desde la capa de red — un fallo
 * de red bloqueaba toda la app con un popup del navegador. Aquí el error es un
 * aviso no bloqueante, con su causa y un botón de reintentar; el canvas nunca
 * se bloquea.
 */
import { t } from '@/i18n/i18n';

export interface ToastOptions {
  message: string;
  /** Si se pasa, el toast ofrece «Reintentar» y no se va solo. */
  onRetry?: () => void;
  /**
   * Acción con nombre propio, para lo que no es reintentar.
   *
   * La necesita RF-31: «se ofrece paginar» es ofrecer *cargar más*, y un botón
   * que ponga «Reintentar» no ofrece nada. Se generaliza en vez de añadir un
   * segundo componente parecido.
   */
  action?: { label: string; onClick: () => void };
  /** ms hasta desaparecer. Los que tienen acción esperan al usuario. */
  timeout?: number;
}

const DEFAULT_TIMEOUT = 6000;

export class Toasts {
  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  show(options: ToastOptions): void {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.role = 'alert';

    const text = document.createElement('span');
    text.textContent = options.message;
    toast.append(text);

    const dismiss = (): void => {
      toast.remove();
    };

    const action =
      options.action ??
      (options.onRetry === undefined
        ? undefined
        : { label: t('toast.retry'), onClick: options.onRetry });

    if (action !== undefined) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toastAction';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        dismiss();
        action.onClick();
      });
      toast.append(button);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ghost';
    close.setAttribute('aria-label', t('toast.dismiss'));
    close.textContent = '✕';
    close.addEventListener('click', dismiss);
    toast.append(close);

    this.container.append(toast);

    // Un toast con acción espera: que se esfume mientras lo lees sería peor
    // que el alert que vino a sustituir.
    const timeout = options.timeout ?? (action === undefined ? DEFAULT_TIMEOUT : 0);
    if (timeout > 0) setTimeout(dismiss, timeout);
  }

  clear(): void {
    this.container.textContent = '';
  }
}
