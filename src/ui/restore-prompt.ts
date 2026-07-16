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

/**
 * Confirmación genérica de «esto se pierde» (RF-04).
 *
 * Mismo overlay y mismo peso visual que el de restaurar: las dos son la misma
 * clase de decisión —qué pasa con el trabajo que hay encima de la mesa— y
 * merecen la misma cara. `true` = adelante; Esc equivale a cancelar, que es lo
 * que no destruye nada.
 */
export function askConfirm(
  container: HTMLElement,
  texts: {
    title: string;
    body: string;
    confirm: string;
    cancel: string;
    extra?: { label: string; onClick: () => void };
  },
): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'confirmOverlay';
    overlay.role = 'dialog';
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'confirmTitle');

    const box = document.createElement('div');
    box.id = 'restoreBox';

    const title = document.createElement('h2');
    title.id = 'confirmTitle';
    title.textContent = texts.title;

    const body = document.createElement('p');
    body.textContent = texts.body;

    const foot = document.createElement('div');
    foot.id = 'tourFoot';
    foot.style.justifyContent = 'flex-end';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ghost';
    cancel.id = 'confirmCancel';
    cancel.textContent = texts.cancel;

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.id = 'confirmOk';
    confirm.textContent = texts.confirm;

    foot.append(cancel);
    if (texts.extra !== undefined) {
      const extra = document.createElement('button');
      extra.type = 'button';
      extra.className = 'ghost';
      extra.id = 'confirmExtra';
      extra.textContent = texts.extra.label;
      extra.addEventListener('click', () => {
        texts.extra?.onClick();
      });
      foot.append(extra);
    }
    foot.append(confirm);

    box.append(title, body, foot);
    overlay.append(box);
    container.append(overlay);

    const close = (ok: boolean): void => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(ok);
    };

    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') close(false);
    }

    cancel.addEventListener('click', () => {
      close(false);
    });
    confirm.addEventListener('click', () => {
      close(true);
    });
    document.addEventListener('keydown', onKey);

    // El foco va a «Cancelar»: en un diálogo que destruye algo, el Enter de
    // alguien que va rápido no puede ser el que destruye.
    cancel.focus();
  });
}

/** Fecha legible en el idioma activo. Un ISO crudo no le dice nada a nadie. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
