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

/**
 * Distancia mínima entre dos satélites vecinos, **según lo que midan**.
 *
 * Una tx es una tarjeta de 180×90 px; una dirección, un círculo de 40. Usar una
 * sola cifra obligaría a elegir entre apretar las txs o separar las direcciones
 * mucho más de lo que hace falta — y esto último cambiaría el radial de siempre
 * (RF-05, el del mock aprobado), que orbita direcciones y está bien como está.
 */
const MIN_SEPARATION: Record<string, number> = { tx: 340, cluster: 340 };
const DEFAULT_SEPARATION = 130;

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

/** Un satélite colocado: en qué anillo va y en qué ángulo. */
interface Slot {
  radius: number;
  angle: number;
}

/**
 * Reparte `count` satélites en **anillos concéntricos** (RF-36.1).
 *
 * ## El problema que resuelve
 *
 * En un solo arco, el radio crece **lineal** con N: cada satélite nuevo empuja a
 * todos hacia fuera para mantener la separación. Con 28 direcciones hacen falta
 * ~1.200 px de radio, el grafo mide 2.440 de alto y el `fit` lo deja al 34 % —
 * ilegible. Con 170 nodos, al 13 %.
 *
 * ## La idea
 *
 * Un anillo de radio `r` admite unos `π·r / separación` satélites. Si se llenan
 * anillos sucesivos en vez de estirar uno, la capacidad total crece con el
 * **área**, así que el radio necesario crece como **√N**. Las mismas 28
 * direcciones caben en tres anillos de ~450-700 px: el grafo se queda en la
 * mitad y se lee.
 *
 * Es lo que hace el sistema solar y no una fila de planetas: cuando hay muchos,
 * se reparten en órbitas.
 */
function ringSlots(count: number, base: number, kind: string): Slot[] {
  if (count === 0) return [];

  const separation = MIN_SEPARATION[kind] ?? DEFAULT_SEPARATION;
  const slots: Slot[] = [];
  let radius = base;
  let placed = 0;

  while (placed < count) {
    // Cuántos caben en este anillo sin pisarse. El −1 sale de `anglesFor`, que
    // deja un hueco de margen en cada extremo del semicírculo.
    const capacity = Math.max(1, Math.floor((Math.PI * radius) / separation) - 1);
    const here = Math.min(capacity, count - placed);

    for (const angle of anglesFor(here)) slots.push({ radius, angle });
    placed += here;

    // El anillo siguiente, a una separación del anterior: si estuvieran más
    // juntos se pisarían en radial en vez de en tangencial, que da igual de mal.
    radius += separation;
  }

  return slots;
}

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

  // Un nodo se queda donde está si el usuario lo movió (pinned) o si el layout
  // ya lo colocó (placed): expandir no puede reorganizar lo que ya se veía.
  const isFixed = (node: GraphNode): boolean => node.pinned === true || node.placed === true;

  // Si la raíz ya tiene sitio, el sistema orbita alrededor de donde está.
  const center = isFixed(root) ? { x: root.x, y: root.y } : options.center;
  if (!isFixed(root)) nodes[rootId] = { ...root, x: center.x, y: center.y, placed: true };

  /*
   * Los vecinos se buscan por la DIRECCIÓN DEL FLUJO, no por el `kind` de la
   * arista: lo que llega al centro va a la izquierda y lo que sale, a la derecha.
   *
   * Antes se filtraba por `kind === 'input'`, lo que daba por supuesto que el
   * centro era una tx. Con una dirección en el centro (RF-02/RF-31) no encontraba
   * ninguna arista —las `input` **salen** de una dirección, no llegan— y dejaba
   * las 25 txs de la página apiladas en el mismo punto. Mirando el flujo, las dos
   * cosas funcionan y significan lo mismo: de dónde vino el dinero y a dónde fue.
   */
  const incoming = Object.values(graph.edges)
    .filter((edge) => edge.to === rootId)
    .map((edge) => edge.from);
  const outgoing = Object.values(graph.edges)
    .filter((edge) => edge.from === rootId)
    .map((edge) => edge.to);

  const place = (ids: string[], side: -1 | 1): void => {
    // El tamaño lo marca el satélite más grande del lado, y cada lado va por su
    // cuenta: una tx puede tener 2 entradas y 25 salidas.
    const biggest = ids.some((id) => nodes[id]?.kind === 'tx') ? 'tx' : 'address';

    /*
     * Con un radio explícito, un solo anillo: quien lo pide sabe lo que quiere.
     * Sin él, tantos anillos como hagan falta (RF-36.1) — es lo que mantiene el
     * grafo dentro de la pantalla cuando hay muchos.
     */
    const slots: Slot[] =
      options.radius === undefined
        ? ringSlots(ids.length, radius, biggest)
        : anglesFor(ids.length).map((angle) => ({ radius: options.radius ?? radius, angle }));

    ids.forEach((id, i) => {
      const node = nodes[id];
      // `pinned` gana siempre: es una decisión del usuario, no del layout.
      // `placed` también: ya tiene un sitio y moverlo desorientaría.
      if (node === undefined || isFixed(node)) return;

      const slot = slots[i];
      if (slot === undefined) return;

      const radians = toRadians(slot.angle);
      nodes[id] = {
        ...node,
        x: center.x + side * slot.radius * Math.cos(radians),
        y: center.y + slot.radius * Math.sin(radians),
        placed: true,
      };
    });
  };

  place(incoming, -1);
  place(outgoing, 1);

  return { ...graph, nodes };
}
