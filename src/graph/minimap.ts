/**
 * Minimapa (RF-13, docs/06 §2).
 *
 * Dibuja el grafo entero en miniatura con el viewport actual marcado; un click
 * lleva la vista ahí. Se pinta con canvas 2D en vez de una segunda instancia de
 * Cytoscape: son cuatro rectángulos y no merece el coste de otro motor.
 *
 * Posición fija a propósito (docs/06 §2): la referencia espacial constante vale
 * más que poder arrastrarlo, y minimizarlo resuelve la oclusión sin añadir
 * estado que mantener.
 *
 * ## Dos capas, porque hay dos ritmos (RNF-01)
 *
 * El grafo en miniatura cambia poco (al añadir, borrar o mover un nodo); el
 * recuadro del viewport cambia en cada frame de un pan. Pintarlos juntos obliga
 * al lento al ritmo del rápido: rehacer 300 nodos y 300 aristas para mover un
 * rectángulo cuyo contenido no se ha movido. Eso costaba ~2,1 ms por frame y era
 * lo único que separaba la app de los 60 fps de RNF-01 — el motor del grafo ya
 * llegaba de sobra.
 *
 * Así que el grafo se pinta en una capa aparte y se cachea. Un pan solo copia
 * esa capa y dibuja el recuadro encima.
 */
import type { Core } from 'cytoscape';
import { TOKENS } from './styles';

const PADDING = 6;

/** Transformación modelo → minimapa. */
interface Projection {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Repintados por capa. Lo lee el E2E de RNF-01; ver `Window.excabitMinimap`. */
export interface MinimapStats {
  /** Veces que se han rehecho las miniaturas de nodos y aristas. */
  graphRepaints: number;
  /** Veces que se ha repintado el recuadro del viewport. */
  viewportRepaints: number;
}

export class Minimap {
  readonly stats: MinimapStats = { graphRepaints: 0, viewportRepaints: 0 };
  private readonly canvas: HTMLCanvasElement;
  /** Capa cacheada con el grafo: sobrevive a los pans. */
  private readonly layer: HTMLCanvasElement;
  private readonly cy: Core;
  private readonly observer: ResizeObserver;
  private frame = 0;
  /** El grafo cambió: la capa cacheada ya no vale. */
  private graphDirty = true;
  /** Válida mientras no cambien los bounds del grafo ni el tamaño del canvas. */
  private projectionCache: Projection | null = null;
  /**
   * Tamaño en px CSS, según el `ResizeObserver`.
   *
   * Se guarda en vez de medirlo al dibujar: `getBoundingClientRect()` fuerza al
   * navegador a recalcular el layout en el acto, y hacerlo dentro del frame de
   * un pan es pedirle ese trabajo 60 veces por segundo para leer un número que
   * casi nunca cambia. El observer nos lo da cuando cambia, que es cuando importa.
   */
  private size: { width: number; height: number };

  constructor(container: HTMLElement, cy: Core) {
    this.cy = cy;
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.cursor = 'pointer';
    container.append(this.canvas);
    this.layer = document.createElement('canvas');

    const rect = this.canvas.getBoundingClientRect();
    this.size = { width: rect.width, height: rect.height };

    this.canvas.addEventListener('click', (event) => {
      this.navigate(event);
    });

    // Un repintado por frame como mucho: el minimapa no puede costarle fps al
    // grafo (RNF-01).
    const schedule = (): void => {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => {
        this.draw();
      });
    };

    // Los dos ritmos, separados en el origen. `pan` y `zoom` mueven la vista:
    // las miniaturas siguen donde estaban y la capa cacheada sigue sirviendo.
    const invalidate = (): void => {
      this.graphDirty = true;
      schedule();
    };
    cy.on('add remove position resize', invalidate);
    cy.on('pan zoom', schedule);

    // El minimapa se colapsa y se expande (docs/06 §2), y eso cambia su tamaño
    // sin que Cytoscape se entere: su contenedor es otro.
    this.observer = new ResizeObserver((entries) => {
      const contentRect = entries[0]?.contentRect;
      if (contentRect !== undefined) {
        this.size = { width: contentRect.width, height: contentRect.height };
      }
      invalidate();
    });
    this.observer.observe(this.canvas);

    schedule();
  }

  /**
   * Ajusta los buffers al tamaño real. Devuelve `true` si cambiaron.
   *
   * Asignar `width`/`height` borra el canvas aunque el valor sea el mismo, así
   * que se comprueba antes: si no, cada frame tiraría la capa cacheada y todo
   * esto no serviría de nada.
   */
  private resizeCanvases(): boolean {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(this.size.width * ratio);
    const height = Math.round(this.size.height * ratio);

    if (this.canvas.width === width && this.canvas.height === height) return false;

    this.canvas.width = width;
    this.canvas.height = height;
    this.layer.width = width;
    this.layer.height = height;

    return true;
  }

  /** Encaja el grafo entero con margen. Depende de los bounds: se cachea. */
  private projection(): Projection | null {
    const bounds = this.cy.elements().boundingBox();
    const { width, height } = this.canvas;
    if (bounds.w === 0 || bounds.h === 0) return null;

    const scale = Math.min((width - PADDING * 2) / bounds.w, (height - PADDING * 2) / bounds.h);

    return {
      scale,
      offsetX: PADDING + (width - PADDING * 2 - bounds.w * scale) / 2 - bounds.x1 * scale,
      offsetY: PADDING + (height - PADDING * 2 - bounds.h * scale) / 2 - bounds.y1 * scale,
    };
  }

  /** Rehace la capa del grafo. Solo cuando el grafo (o el tamaño) ha cambiado. */
  private paintGraphLayer(): void {
    const context = this.layer.getContext('2d');
    if (context === null) return;

    this.stats.graphRepaints++;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.layer.width, this.layer.height);
    context.fillStyle = TOKENS.bg;
    context.fillRect(0, 0, this.layer.width, this.layer.height);

    this.projectionCache = this.projection();
    if (this.projectionCache === null) return;

    const { scale, offsetX, offsetY } = this.projectionCache;
    const toMap = (x: number, y: number) => ({ x: x * scale + offsetX, y: y * scale + offsetY });

    // Aristas primero: los nodos van encima.
    context.strokeStyle = TOKENS.border;
    context.lineWidth = 1;
    this.cy.edges().forEach((edge) => {
      const from = toMap(edge.source().position('x'), edge.source().position('y'));
      const to = toMap(edge.target().position('x'), edge.target().position('y'));
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
    });

    this.cy.nodes().forEach((node) => {
      const { x, y } = toMap(node.position('x'), node.position('y'));
      const isTx = node.data('kind') === 'tx';
      context.fillStyle = node.data('isRoot') === true ? TOKENS.accent : TOKENS.textDim;
      const size = isTx ? 4 : 3;
      context.fillRect(x - size / 2, y - size / 2, size, size);
    });
  }

  private draw(): void {
    const context = this.canvas.getContext('2d');
    if (context === null) return;

    // Un canvas nuevo nace vacío: si cambió de tamaño, la capa hay que rehacerla.
    if (this.resizeCanvases()) this.graphDirty = true;

    // Colapsado (docs/06 §2): el contenedor mide 0 y no hay dónde dibujar.
    // `drawImage` de un canvas de 0×0 no es un no-op, es una excepción.
    if (this.canvas.width === 0 || this.canvas.height === 0) return;

    if (this.graphDirty) {
      this.paintGraphLayer();
      this.graphDirty = false;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.drawImage(this.layer, 0, 0);

    const projection = this.projectionCache;
    if (projection === null) return;

    this.stats.viewportRepaints++;

    // Viewport: qué parte del grafo se está mirando.
    const { scale, offsetX, offsetY } = projection;
    const toMap = (x: number, y: number) => ({ x: x * scale + offsetX, y: y * scale + offsetY });
    const extent = this.cy.extent();
    const topLeft = toMap(extent.x1, extent.y1);
    const bottomRight = toMap(extent.x2, extent.y2);
    context.strokeStyle = TOKENS.accent;
    context.lineWidth = 1;
    context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  }

  /** Click en el minimapa: centra la vista ahí. */
  private navigate(event: MouseEvent): void {
    const projection = this.projectionCache;
    if (projection === null) return;

    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const x = ((event.clientX - rect.left) * ratio - projection.offsetX) / projection.scale;
    const y = ((event.clientY - rect.top) * ratio - projection.offsetY) / projection.scale;

    this.cy.center(this.cy.collection());
    this.cy.pan({
      x: this.cy.width() / 2 - x * this.cy.zoom(),
      y: this.cy.height() / 2 - y * this.cy.zoom(),
    });
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.canvas.remove();
  }
}
