/**
 * Barra de la línea temporal (RF-35).
 *
 * Dos tiradores sobre el rango de fechas de la investigación. Lo que cae fuera se
 * atenúa; los datos no se tocan.
 *
 * Son dos `<input type="range">` nativos, no un componente de terceros ni un
 * arrastre a mano: vienen con teclado (flechas, Inicio/Fin), lector de pantalla y
 * foco, que es justo lo que un slider casero nunca acaba de tener (RNF-05).
 */
import { t } from '@/i18n/i18n';
import { formatNumber } from '@/i18n/format';

export interface TimelineRange {
  from: number;
  to: number;
}

export interface TimelineOptions {
  container: HTMLElement;
  /** El rango elegido cambió. */
  onChange: (range: TimelineRange) => void;
  /** La barra se cerró: fuera el filtro. */
  onClose: () => void;
}

export class Timeline {
  private readonly root: HTMLElement;
  private readonly fromInput: HTMLInputElement;
  private readonly toInput: HTMLInputElement;
  private readonly label: HTMLElement;
  private readonly options: TimelineOptions;
  private bounds: TimelineRange = { from: 0, to: 0 };

  constructor(options: TimelineOptions) {
    this.options = options;

    this.root = document.createElement('div');
    this.root.id = 'timeline';
    this.root.hidden = true;
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', t('timeline.title'));

    this.fromInput = this.makeSlider('timelineFrom', t('timeline.from'));
    this.toInput = this.makeSlider('timelineTo', t('timeline.to'));

    this.label = document.createElement('span');
    this.label.id = 'timelineLabel';

    const close = document.createElement('button');
    close.type = 'button';
    close.id = 'timelineClose';
    close.className = 'ghost';
    close.setAttribute('aria-label', t('timeline.close'));
    close.textContent = '✕';
    close.addEventListener('click', () => {
      this.hide();
      options.onClose();
    });

    const sliders = document.createElement('div');
    sliders.id = 'timelineSliders';
    sliders.append(this.fromInput, this.toInput);

    this.root.append(sliders, this.label, close);
    options.container.append(this.root);
  }

  private makeSlider(id: string, label: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'range';
    input.id = id;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => {
      this.clamp(input);
      this.options.onChange(this.range);
    });

    return input;
  }

  /**
   * Un tirador no puede pasar al otro.
   *
   * Sin esto se cruzan y el rango queda del revés (`from > to`), que no coge nada
   * y deja al usuario mirando un grafo entero apagado sin saber por qué.
   */
  private clamp(moved: HTMLInputElement): void {
    const from = Number(this.fromInput.value);
    const to = Number(this.toInput.value);
    if (from <= to) return;

    if (moved === this.fromInput) this.toInput.value = String(from);
    else this.fromInput.value = String(to);
  }

  get range(): TimelineRange {
    return { from: Number(this.fromInput.value), to: Number(this.toInput.value) };
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Abre la barra sobre `bounds`, con todo el rango seleccionado. */
  show(bounds: TimelineRange): void {
    this.bounds = bounds;

    for (const input of [this.fromInput, this.toInput]) {
      input.min = String(bounds.from);
      input.max = String(bounds.to);
      // Un día por paso: el bloque exacto no le importa a nadie y con pasos de un
      // segundo el tirador es imposible de colocar.
      input.step = String(24 * 60 * 60);
    }
    this.fromInput.value = String(bounds.from);
    this.toInput.value = String(bounds.to);

    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  /**
   * Actualiza el texto: fechas y cuántas txs quedan dentro.
   *
   * El contador no es decorativo: un filtro que no dice qué esconde es una
   * trampa — el usuario ve menos cosas y no sabe si es que no hay más.
   */
  setStatus(inside: number, total: number): void {
    const { from, to } = this.range;

    this.label.textContent = `${formatDay(from)} — ${formatDay(to)} · ${t('timeline.count', {
      inside: formatNumber(inside),
      total: formatNumber(total),
    })}`;
  }

  /** El rango completo, para saber si el filtro está tocado. */
  get fullRange(): TimelineRange {
    return this.bounds;
  }
}

/** Solo el día: la hora de un bloque no ayuda a elegir un rango. */
function formatDay(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
