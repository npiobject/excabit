/**
 * Layout radial: la tx al centro, sus direcciones en órbita (RF-05).
 *
 * Es la seña de identidad visual de excabit y la que motivó el spike de la
 * ADR-001 (`tests/unit/graph/spike-cytoscape.spec.ts`): Cytoscape lo reproduce
 * con `preset`, así que aquí solo se calculan posiciones. Módulo puro, sin
 * Cytoscape ni DOM.
 *
 * Diferencia deliberada con el legacy: éste repartía las entradas por el
 * semicírculo SUPERIOR y las salidas por el inferior (`y = yc − r·sin θ`).
 * La v2 usa izquierda→derecha (RF-05 y el mock aprobado), que es la convención
 * de lectura del flujo de fondos y lo que espera cualquiera que venga de otro
 * explorador.
 */
import type { Graph, GraphNode } from '@/core/graph-model';

export const DEFAULT_RADIUS = 235;

export interface LayoutOptions {
  center: { x: number; y: number };
  radius?: number;
}

/**
 * Reparte `count` satélites por un semicírculo, con margen en los extremos.
 *
 * Para N satélites, el semicírculo (180°) se divide en N+1 huecos y se colocan
 * en las divisiones interiores: así ninguno queda pegado al eje vertical.
 * N=1 → 0° (a la altura del centro); N=2 → ∓30°; N=3 → ∓45° y 0°.
 * Es la misma idea que `180/(numEntradas + 1)` del legacy.
 */
function anglesFor(count: number): number[] {
  const step = 180 / (count + 1);

  return Array.from({ length: count }, (_, i) => -90 + step * (i + 1));
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Coloca la tx `rootId` y sus direcciones vecinas.
 *
 * Respeta los nodos `pinned` (RF-06): si el usuario movió algo, ahí se queda —
 * expandir el grafo no puede deshacer el trabajo de colocación que ya hizo.
 * Puro: devuelve un grafo nuevo.
 */
export function layoutRadial(graph: Graph, rootId: string, options: LayoutOptions): Graph {
  const root = graph.nodes[rootId];
  if (root === undefined) return graph;

  const radius = options.radius ?? DEFAULT_RADIUS;
  const nodes: Record<string, GraphNode> = { ...graph.nodes };

  // Si el usuario ya movió la raíz, el sistema orbita alrededor de donde la
  // dejó; si no, se centra donde diga el llamante.
  const center = root.pinned === true ? { x: root.x, y: root.y } : options.center;
  if (root.pinned !== true) nodes[rootId] = { ...root, x: center.x, y: center.y };

  const inputs = Object.values(graph.edges)
    .filter((edge) => edge.kind === 'input' && edge.to === rootId)
    .map((edge) => edge.from);
  const outputs = Object.values(graph.edges)
    .filter((edge) => edge.kind === 'output' && edge.from === rootId)
    .map((edge) => edge.to);

  const place = (ids: string[], side: -1 | 1): void => {
    const angles = anglesFor(ids.length);

    ids.forEach((id, i) => {
      const node = nodes[id];
      // `pinned` gana siempre: es una decisión del usuario, no del layout.
      if (node === undefined || node.pinned === true) return;

      const radians = toRadians(angles[i] ?? 0);
      nodes[id] = {
        ...node,
        x: center.x + side * radius * Math.cos(radians),
        y: center.y + radius * Math.sin(radians),
      };
    });
  };

  place(inputs, -1);
  place(outputs, 1);

  return { ...graph, nodes };
}
