/**
 * Clustering de direcciones (RF-19, docs/04 H-09).
 *
 * H-09 (CIOH) dice qué direcciones firman juntas **una** tx. Lo que hace útil a
 * la heurística es unir esos grupos **transitivamente**: si una tx enlaza A con B
 * y otra enlaza B con C, las tres son del mismo dueño aunque A y C no hayan
 * coincidido jamás. Eso es lo que convierte un montón de direcciones sueltas en
 * «esto es un monedero» (Meiklejohn et al., *A Fistful of Bitcoins*).
 *
 * ## Todo el peso está en no equivocarse
 *
 * La transitividad es potente y por eso es peligrosa: **un solo falso positivo
 * contamina el grafo entero**. Si una CoinJoin colara, uniría a dos desconocidos,
 * y a partir de ahí sus monederos quedarían fundidos en uno para siempre. De ahí
 * que la única fuente sea `commonInputOwnership`, con su descarte de CoinJoin ya
 * calibrado con datos reales (docs/04), en vez de reimplementar el criterio aquí.
 */
import type { Graph } from '../core/graph-model';
import type { AddressId, Txid } from '../core/types';
import { commonInputOwnership } from './heuristics/h09-common-input-ownership';

export interface AddressCluster {
  /**
   * Id estable del cluster.
   *
   * Se deriva de la dirección menor del grupo, no de un contador ni del orden de
   * aparición: acaba en el fichero guardado (RF-21) y en el historial de undo, y
   * un id que cambie entre ejecuciones haría que una investigación guardada no se
   * pudiera volver a abrir igual.
   */
  id: string;
  addresses: AddressId[];
  /**
   * Txs que justifican la agrupación.
   *
   * Sin esto el usuario ve una caja alrededor de tres direcciones y tiene que
   * creérselo — justo lo contrario de la propuesta de valor nº 3 (docs/00 §3):
   * enseñar en qué se basa cada afirmación.
   */
  evidence: Txid[];
}

export const clusterNodeId = (seed: AddressId): string => `cluster:${seed}`;

/** Union-find con compresión de caminos. Es todo lo que hace falta aquí. */
class DisjointSet {
  private readonly parent = new Map<string, string>();

  find(id: string): string {
    const parent = this.parent.get(id);
    if (parent === undefined) {
      this.parent.set(id, id);

      return id;
    }
    if (parent === id) return id;

    const root = this.find(parent);
    this.parent.set(id, root);

    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;

    // El menor manda: así el representante de un grupo no depende del orden en
    // que llegaron sus direcciones, y el id del cluster sale estable.
    if (rootA < rootB) this.parent.set(rootB, rootA);
    else this.parent.set(rootA, rootB);
  }
}

/**
 * Agrupa las direcciones del grafo por dueño presunto.
 *
 * Solo mira las txs que el grafo tiene cargadas: una dirección cuya tx aún no se
 * ha descargado (una investigación recién migrada del legacy, por ejemplo) no
 * agrupa nada. Es lo correcto — agrupar exige pruebas, y las pruebas son las txs.
 */
export function findClusters(graph: Graph): AddressCluster[] {
  const sets = new DisjointSet();
  const evidence = new Map<string, Set<Txid>>();

  for (const node of Object.values(graph.nodes)) {
    const tx = node.tx;
    if (tx === undefined) continue;

    const result = commonInputOwnership(tx);
    if (result.outcome !== 'detected') continue;

    const cluster = result.details?.['cluster'];
    if (!Array.isArray(cluster)) continue;

    const addresses = cluster.filter((value): value is AddressId => typeof value === 'string');
    const [first] = addresses;
    if (first === undefined) continue;

    for (const address of addresses) sets.union(first, address);
    // La evidencia se cuelga del representante del grupo, que puede cambiar al
    // unir con otro: por eso se re-agrupa al final, ya con las raíces definitivas.
    const root = sets.find(first);
    const seen = evidence.get(root) ?? new Set<Txid>();
    seen.add(tx.txid);
    evidence.set(root, seen);
  }

  /* ---- De los conjuntos a los clusters ---- */

  const groups = new Map<string, AddressId[]>();
  for (const node of Object.values(graph.nodes)) {
    if (node.kind !== 'address' || node.address === undefined) continue;

    const root = sets.find(node.address);
    // `find` da de alta lo que no conocía: una dirección que nunca se unió a
    // nada es su propia raíz y no forma cluster.
    const group = groups.get(root) ?? [];
    group.push(node.address);
    groups.set(root, group);
  }

  const clusters: AddressCluster[] = [];
  for (const [root, addresses] of groups) {
    // Un cluster de una sola dirección no une nada: es una dirección.
    if (addresses.length < 2) continue;

    const sorted = [...addresses].sort();
    const seed = sorted[0];
    if (seed === undefined) continue;

    // La evidencia pudo quedar colgada de una raíz intermedia: se recogen todas
    // las que ahora apuntan a esta.
    const proof = new Set<Txid>();
    for (const [key, txids] of evidence) {
      if (sets.find(key) !== root) continue;
      for (const txid of txids) proof.add(txid);
    }

    clusters.push({ id: clusterNodeId(seed), addresses: sorted, evidence: [...proof].sort() });
  }

  return clusters.sort((a, b) => a.id.localeCompare(b.id));
}
