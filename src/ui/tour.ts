/**
 * Tour de primer uso (RF-32, docs/06 §5).
 *
 * Sustituye a los 13 vídeos mp4 de ayuda del legacy (F-03), que pesaban ~1 MB
 * cada uno y había que ver aparte. Cinco pasos señalando lo que hay que saber:
 * buscar, expandir, panel, palette y guardar.
 *
 * Aparece **solo en el primer arranque**: una ayuda que reaparece es un estorbo.
 */
import { t, type MessageKey } from '@/i18n/i18n';

const STORAGE_KEY = 'excabit.tourSeen';

interface Step {
  title: MessageKey;
  body: MessageKey;
}

const STEPS: Step[] = [
  { title: 'tour.step.search.title', body: 'tour.step.search.body' },
  { title: 'tour.step.expand.title', body: 'tour.step.expand.body' },
  { title: 'tour.step.panel.title', body: 'tour.step.panel.body' },
  { title: 'tour.step.palette.title', body: 'tour.step.palette.body' },
  { title: 'tour.step.save.title', body: 'tour.step.save.body' },
];

export class Tour {
  private readonly container: HTMLElement;
  private overlay: HTMLElement | null = null;
  private step = 0;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  static get seen(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // Sin almacenamiento, mejor no enseñarlo que enseñarlo en cada carga.
      return true;
    }
  }

  private static markSeen(): void {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Ídem: no poder recordarlo no debe romper el cierre del tour.
    }
  }

  /** Solo en el primer arranque (RF-32). */
  startIfFirstRun(): void {
    if (Tour.seen) return;

    this.start();
  }

  start(): void {
    this.step = 0;
    this.render();
  }

  private close(): void {
    Tour.markSeen();
    this.overlay?.remove();
    this.overlay = null;
  }

  private render(): void {
    this.overlay?.remove();

    const step = STEPS[this.step];
    if (step === undefined) {
      this.close();
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'tourOverlay';

    const dots = STEPS.map((_, i) => `<i class="${i === this.step ? 'on' : ''}"></i>`).join('');
    const last = this.step === STEPS.length - 1;

    overlay.innerHTML = `
      <div id="tourBox" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
        <h2 id="tourTitle">${t(step.title)}</h2>
        <p>${t(step.body)}</p>
        <div id="tourFoot">
          <div id="tourDots">${dots}</div>
          <button type="button" id="tourSkip" class="ghost">${t('tour.skip')}</button>
          ${this.step > 0 ? `<button type="button" id="tourBack">${t('tour.back')}</button>` : ''}
          <button type="button" id="tourNext" class="primary">${last ? t('tour.done') : t('tour.next')}</button>
        </div>
      </div>`;

    overlay.querySelector('#tourSkip')?.addEventListener('click', () => {
      this.close();
    });
    overlay.querySelector('#tourBack')?.addEventListener('click', () => {
      this.step -= 1;
      this.render();
    });
    overlay.querySelector('#tourNext')?.addEventListener('click', () => {
      this.step += 1;
      this.render();
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close();
    });

    this.container.append(overlay);
    this.overlay = overlay;
    overlay.querySelector<HTMLElement>('#tourNext')?.focus();
  }
}
