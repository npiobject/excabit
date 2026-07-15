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
 */
import type { Core } from 'cytoscape';
import { TOKENS } from './styles';

const PADDING = 6;

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly cy: Core;
  private frame = 0;

  constructor(container: HTMLElement, cy: Core) {
    this.cy = cy;
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.cursor = 'pointer';
    container.append(this.canvas);

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
    cy.on('add remove position pan zoom resize', schedule);
    schedule();
  }

  /** Transformación modelo → minimapa: encaja el grafo entero con margen. */
  private projection(): { scale: number; offsetX: number; offsetY: number } | null {
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

  private draw(): void {
    const context = this.canvas.getContext('2d');
    if (context === null) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * ratio;
    this.canvas.height = rect.height * ratio;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.fillStyle = TOKENS.bg;
    context.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const projection = this.projection();
    if (projection === null) return;

    const { scale, offsetX, offsetY } = projection;
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

    // Viewport: qué parte del grafo se está mirando.
    const extent = this.cy.extent();
    const topLeft = toMap(extent.x1, extent.y1);
    const bottomRight = toMap(extent.x2, extent.y2);
    context.strokeStyle = TOKENS.accent;
    context.lineWidth = 1;
    context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  }

  /** Click en el minimapa: centra la vista ahí. */
  private navigate(event: MouseEvent): void {
    const projection = this.projection();
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
    this.canvas.remove();
  }
}
