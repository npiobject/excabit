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

    if (options.onRetry !== undefined) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = t('toast.retry');
      retry.addEventListener('click', () => {
        dismiss();
        options.onRetry?.();
      });
      toast.append(retry);
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
    const timeout = options.timeout ?? (options.onRetry === undefined ? DEFAULT_TIMEOUT : 0);
    if (timeout > 0) setTimeout(dismiss, timeout);
  }

  clear(): void {
    this.container.textContent = '';
  }
}
