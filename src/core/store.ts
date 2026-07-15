/**
 * Store: única fuente de verdad del estado de la investigación (docs/05 §2).
 *
 * BUG-020: el legacy usaba ~60 variables globales mutables y 20+ flags-semáforo
 * que `draw()` sondeaba en cada frame. Nadie podía decir quién cambiaba qué.
 *
 * Reglas que hace cumplir este módulo:
 *
 * 1. El estado solo cambia despachando un **comando** (ADR-004). No hay
 *    setters: quien quiera cambiar algo, declara qué cambio quiere.
 * 2. `getState()` devuelve un objeto congelado: mutarlo por fuera lanza en vez
 *    de corromper el modelo en silencio.
 * 3. Los cambios se anuncian por eventos. El grafo y los paneles se
 *    redibujan escuchando, no sondeando.
 *
 * El flujo es siempre: interacción → comando → store → evento → render. La capa
 * `data/` nunca escribe aquí: sus fetch resuelven y el resultado se despacha.
 */

/**
 * Un comando describe una transición de estado como función pura.
 *
 * La pila de undo/redo (RF-28, Fase 3) se construye encima de esto: como
 * `apply` no muta, guardar el estado previo basta para deshacer, sin las
 * capturas de imagen del canvas que hacían crecer la memoria sin límite
 * en el legacy (BUG-013).
 */
export interface Command<S> {
  readonly type: string;
  apply(state: S): S;
}

export interface StoreEvent<S> {
  /** `type` del comando que provocó el cambio. */
  readonly type: string;
  readonly state: Readonly<S>;
  readonly previous: Readonly<S>;
}

export type Listener<S> = (event: StoreEvent<S>) => void;

export interface StoreOptions<S> {
  /**
   * Congela el estado en profundidad para que nadie lo mute por fuera.
   * Por defecto activo. Se puede desactivar si algún día el coste de congelar
   * un grafo grande se nota — con una medición delante, no por intuición.
   */
  freeze?: boolean;
  /**
   * Qué hacer si un suscriptor lanza. Por defecto se ignora: un panel roto no
   * puede tumbar la app ni impedir que los demás se enteren del cambio.
   */
  onListenerError?: (error: unknown, event: StoreEvent<S>) => void;
}

/** Congelado profundo, saltándose lo ya congelado para no recorrer de más. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;

  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }

  return value;
}

export class Store<S> {
  private state: S;
  private readonly listeners = new Set<{ fn: Listener<S> }>();
  private readonly shouldFreeze: boolean;
  private readonly onListenerError: ((error: unknown, event: StoreEvent<S>) => void) | undefined;

  constructor(initialState: S, options: StoreOptions<S> = {}) {
    this.shouldFreeze = options.freeze ?? true;
    this.onListenerError = options.onListenerError;
    this.state = this.shouldFreeze ? deepFreeze(initialState) : initialState;
  }

  getState(): Readonly<S> {
    return this.state;
  }

  /**
   * Aplica un comando. Si el estado no cambia (identidad), no se emite evento:
   * un no-op no debe provocar un repintado del grafo.
   */
  dispatch(command: Command<S>): void {
    const previous = this.state;
    const next = command.apply(previous);

    if (next === previous) return;

    this.state = this.shouldFreeze ? deepFreeze(next) : next;

    const event: StoreEvent<S> = { type: command.type, state: this.state, previous };
    this.emit(event);
  }

  private emit(event: StoreEvent<S>): void {
    // Copia de la lista: un suscriptor puede darse de baja mientras se emite.
    for (const entry of [...this.listeners]) {
      try {
        entry.fn(event);
      } catch (error) {
        this.onListenerError?.(error, event);
      }
    }
  }

  /** Devuelve la función para darse de baja. */
  subscribe(listener: Listener<S>): () => void {
    // Envoltorio por identidad: suscribir dos veces la misma función debe
    // notificar dos veces, y cada baja cancelar solo su suscripción.
    const entry = { fn: listener };
    this.listeners.add(entry);

    return () => {
      this.listeners.delete(entry);
    };
  }
}
