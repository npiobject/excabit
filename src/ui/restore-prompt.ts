/**
 * «Tienes una investigación sin terminar» (RF-22).
 *
 * ## Por qué un diálogo y no un toast
 *
 * Un toast se puede ignorar, y mientras sigue en pantalla el usuario ya está
 * trabajando — y el autosave de la sesión nueva pisa el que ofrecía restaurar.
 * El aviso habría sido más amable que perder el trabajo que anunciaba. Restaurar
 * o no es la primera decisión de la sesión y hay que tomarla antes de empezar.
 *
 * Se reutiliza el overlay del tour: mismo peso visual para la misma clase de
 * interrupción (docs/06 §5).
 */
import { t } from '@/i18n/i18n';
import { formatNumber } from '@/i18n/format';

export interface RestorePromptData {
  updatedAt: string;
  nodeCount: number;
}

/**
 * Muestra el diálogo. `true` = restaurar, `false` = empezar de cero.
 *
 * No hay tercera opción a propósito: cerrar con Esc equivale a «ahora no», que
 * es empezar de cero. Dejar el autosave en el limbo obligaría a volver a
 * preguntar en la siguiente carga por algo que ya se descartó una vez.
 */
export function askRestore(container: HTMLElement, data: RestorePromptData): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'restoreOverlay';
    overlay.role = 'dialog';
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'restoreTitle');

    const box = document.createElement('div');
    // Id propio: comparte el aspecto del tour pero no su posición (el tour se
    // planta abajo para no tapar lo que señala; esto va centrado).
    box.id = 'restoreBox';

    const title = document.createElement('h2');
    title.id = 'restoreTitle';
    title.textContent = t('restore.title');

    const body = document.createElement('p');
    body.textContent = t('restore.body', {
      date: formatDate(data.updatedAt),
      count: formatNumber(data.nodeCount),
    });

    const foot = document.createElement('div');
    foot.id = 'tourFoot';
    foot.style.justifyContent = 'flex-end';

    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'ghost';
    discard.id = 'restoreDiscard';
    discard.textContent = t('restore.discard');

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.id = 'restoreConfirm';
    confirm.textContent = t('restore.confirm');

    foot.append(discard, confirm);
    box.append(title, body, foot);
    overlay.append(box);
    container.append(overlay);

    const close = (restore: boolean): void => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(restore);
    };

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') close(false);
    }

    discard.addEventListener('click', () => {
      close(false);
    });
    confirm.addEventListener('click', () => {
      close(true);
    });
    document.addEventListener('keydown', onKey);

    // El foco va a «Restaurar»: es lo que quiere quien ve este diálogo, y deja
    // el Enter listo. Además, un diálogo sin foco dentro deja al lector de
    // pantalla leyendo la página de detrás.
    confirm.focus();
  });
}

/** Fecha legible en el idioma activo. Un ISO crudo no le dice nada a nadie. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
