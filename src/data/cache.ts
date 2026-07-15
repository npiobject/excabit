/**
 * Caché con TTL y límite LRU (docs/05 §4).
 *
 * Corrige dos defectos del legacy:
 *
 * - **BUG-002**: `datos = response.json()` sin `await` metía *Promises* en la
 *   caché. Funcionaba de rebote porque quien leía hacía `await` sobre el valor,
 *   pero cualquier lector síncrono recibía una Promise. Aquí solo se almacena
 *   el valor ya resuelto; las peticiones en vuelo viven en un mapa aparte que
 *   se vacía en cuanto se resuelven.
 * - **BUG-004**: las direcciones no se cacheaban (el push estaba comentado) y
 *   nada acotaba el tamaño. Aquí toda entrada tiene TTL y el mapa tiene tope.
 */

/**
 * Políticas de caducidad. `null` = no expira.
 *
 * Una tx confirmada es inmutable: cachearla para siempre es correcto, no un
 * atajo. Lo que cambia es el estado de una dirección o de una tx en mempool.
 */
export const TTL = {
  /** Tx confirmada: inmutable. */
  CONFIRMED: null,
  /** Tx en mempool: puede confirmarse o desaparecer. */
  UNCONFIRMED: 30_000,
  /** Dirección: su saldo y su lista de txs cambian. */
  ADDRESS: 30_000,
  /** Outspends: un output sin gastar puede gastarse en cualquier momento. */
  OUTSPENDS: 30_000,
} as const;

export type TtlMs = number | null;

interface Entry {
  value: unknown;
  /** Epoch ms en que caduca; `null` = nunca. */
  expiresAt: number | null;
}

export interface TtlLruCacheOptions {
  maxEntries?: number;
  /** Inyectable para tests; por defecto el reloj del sistema. */
  now?: () => number;
}

const DEFAULT_MAX_ENTRIES = 500;

export class TtlLruCache {
  readonly maxEntries: number;
  private readonly now: () => number;

  /**
   * `Map` conserva el orden de inserción: la primera clave es la menos
   * recientemente usada, porque cada acierto la reinserta al final.
   */
  private readonly entries = new Map<string, Entry>();

  /** Peticiones en vuelo, para que N llamadas concurrentes = 1 fetch. */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(options: TtlLruCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  /** Devuelve lo almacenado tal cual, sin tocar el orden LRU ni el TTL. */
  peek(key: string): unknown {
    return this.entries.get(key)?.value;
  }

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt !== null && this.now() >= entry.expiresAt;
  }

  /**
   * Lee respetando el TTL. Un acierto refresca la posición LRU de la clave.
   *
   * `V` no se infiere: es una aserción del llamante, que sabe qué tipo guardó
   * bajo su clave (`tx:…` → EsploraTx, `addr:…` → EsploraAddress). La caché es
   * heterogénea a propósito; el precio es este cast, acotado a esta línea.
   */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  get<V>(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;

    if (this.isExpired(entry)) {
      this.entries.delete(key);
      return undefined;
    }

    // Reinsertar = marcar como la más reciente.
    this.entries.delete(key);
    this.entries.set(key, entry);

    return entry.value as V;
  }

  set(key: string, value: unknown, ttlMs: TtlMs): void {
    this.entries.delete(key);
    this.entries.set(key, {
      value,
      expiresAt: ttlMs === null ? null : this.now() + ttlMs,
    });

    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) return;
      this.entries.delete(oldest.value);
    }
  }

  /**
   * Devuelve el valor cacheado o lo pide con `loader`, garantizando un único
   * fetch por clave aunque haya N llamadas concurrentes.
   *
   * Un fallo NO se cachea: se propaga al llamante (que decidirá si reintenta)
   * y la clave queda libre. Cachear errores convertiría un fallo de red
   * transitorio en un fallo permanente hasta el TTL.
   */
  async through<V>(key: string, loader: () => Promise<V>, ttlMs: TtlMs): Promise<V> {
    const cached = this.get<V>(key);
    if (cached !== undefined) return cached;

    const pending = this.inFlight.get(key);
    if (pending !== undefined) return pending as Promise<V>;

    const request = loader()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);

    return request;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }
}
