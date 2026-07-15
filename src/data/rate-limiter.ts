/**
 * Cola con límite de ritmo y reintentos con backoff (RNF-04, docs/05 §4).
 *
 * mempool.space es un servicio público y gratuito: la ADR-002 lo eligió como
 * proveedor único a cambio de portarse bien con él. Este módulo es esa
 * contrapartida.
 *
 * Modelo: *token bucket*. Se permite una ráfaga de `requestsPerSecond`
 * peticiones y luego un hueco nuevo cada `1000/requestsPerSecond` ms. Encaja
 * con cómo se usa la app (abrir una tx dispara varias llamadas a la vez y
 * luego hay pausas) mejor que un espaciado rígido, que penalizaría la ráfaga
 * inicial sin necesidad.
 */
import { isApiError } from './errors';

export interface RateLimiterOptions {
  /** Peticiones por segundo y, a la vez, tamaño de la ráfaga permitida. */
  requestsPerSecond?: number;
  /** Reintentos tras el primer intento fallido. */
  maxRetries?: number;
  /** Espera base del backoff; se duplica en cada reintento. */
  baseDelayMs?: number;
  /** Inyectables para tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Se llama con la espera calculada antes de cada reintento (observabilidad). */
  onBackoff?: (delayMs: number, attempt: number) => void;
}

interface QueueItem<T = unknown> {
  task: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  attempt: number;
}

const DEFAULTS = {
  requestsPerSecond: 4,
  maxRetries: 3,
  baseDelayMs: 500,
} as const;

/** Proporción máxima de jitter sobre la espera calculada. */
const JITTER_RATIO = 0.5;

export class RateLimiter {
  private readonly requestsPerSecond: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly onBackoff: ((delayMs: number, attempt: number) => void) | undefined;

  private readonly queue: QueueItem[] = [];
  private running = 0;
  private draining = false;

  private tokens: number;
  private lastRefill: number;

  constructor(options: RateLimiterOptions = {}) {
    this.requestsPerSecond = options.requestsPerSecond ?? DEFAULTS.requestsPerSecond;
    this.maxRetries = options.maxRetries ?? DEFAULTS.maxRetries;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = options.random ?? Math.random;
    this.onBackoff = options.onBackoff;

    this.tokens = this.requestsPerSecond;
    this.lastRefill = this.now();
  }

  /** Tareas en cola o en vuelo. Debe volver a 0 cuando todo se ha resuelto. */
  get pending(): number {
    return this.queue.length + this.running;
  }

  /**
   * Encola `task` respetando el límite de ritmo y reintentando los errores
   * transitorios. Devuelve lo que devuelva la tarea, o propaga su error si no
   * es reintentable o si se agotaron los reintentos.
   */
  schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
        attempt: 0,
      });
      void this.drain();
    });
  }

  private refill(): void {
    const elapsed = this.now() - this.lastRefill;
    if (elapsed <= 0) return;

    const gained = (elapsed * this.requestsPerSecond) / 1000;
    this.tokens = Math.min(this.requestsPerSecond, this.tokens + gained);
    this.lastRefill = this.now();
  }

  /** Espera hasta que haya un hueco disponible y lo consume. */
  private async acquireToken(): Promise<void> {
    for (;;) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      const missing = 1 - this.tokens;
      const waitMs = Math.ceil((missing * 1000) / this.requestsPerSecond);
      await this.sleep(waitMs);
    }
  }

  /**
   * Saca de la cola en orden FIFO. Lanza cada tarea sin esperar su resultado:
   * el límite es de peticiones por segundo, no de concurrencia — esperarlas
   * serializaría la red y haría la app mucho más lenta de lo necesario.
   */
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (item === undefined) break;

        await this.acquireToken();
        this.running += 1;
        void this.execute(item);
      }
    } finally {
      this.draining = false;
    }
  }

  private backoffDelay(attempt: number): number {
    const exponential = this.baseDelayMs * 2 ** attempt;

    // Jitter: sin él, N clientes que reciben 429 a la vez reintentan a la vez
    // y vuelven a tumbar al proveedor en manada.
    return Math.round(exponential * (1 + this.random() * JITTER_RATIO));
  }

  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.maxRetries) return false;

    // Solo reintentamos lo que sabemos interpretar y puede cambiar por sí solo:
    // un 404 seguirá siendo 404 y un TypeError es un bug nuestro, no del enlace.
    return isApiError(error) && error.isRetryable;
  }

  private async execute(item: QueueItem): Promise<void> {
    try {
      const result = await item.task();
      item.resolve(result);
    } catch (error) {
      if (!this.shouldRetry(error, item.attempt)) {
        item.reject(error);
        return;
      }

      const delay = this.backoffDelay(item.attempt);
      this.onBackoff?.(delay, item.attempt);
      await this.sleep(delay);

      // Vuelve al frente: es más antigua que lo que haya entrado después.
      this.queue.unshift({ ...item, attempt: item.attempt + 1 });
      void this.drain();
    } finally {
      this.running -= 1;
    }
  }
}
