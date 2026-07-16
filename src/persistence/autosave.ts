/**
 * Autosave de la investigación en curso (RF-22).
 *
 * ## Guarda el mismo formato que el fichero
 *
 * Lo que va a IndexedDB es el texto que produciría «Guardar como…»: un solo
 * formato, un solo validador, un solo camino que probar. Si el autosave tuviera
 * su propia serialización, «restaurar ≡ round-trip» sería una coincidencia que
 * mantener a mano, y tarde o temprano se rompería por un lado sin que el otro se
 * enterase.
 *
 * ## Debounce
 *
 * Arrastrar un nodo dispara decenas de comandos por segundo. Escribir en cada
 * uno pondría a IndexedDB a competir con el render por el hilo principal, que es
 * exactamente lo que RNF-01 no perdona. Se guarda cuando la mano se para.
 *
 * ## IndexedDB y no localStorage
 *
 * `localStorage` es síncrono —bloquea el hilo del render— y ronda los 5 MB. Una
 * investigación con las txs dentro los pasa sin despeinarse. El legacy usaba
 * `storeItem()` (localStorage) y por eso solo guardaba metadatos sueltos.
 */
import type { InvestigationState } from '../core/commands';
import {
  loadInvestigation,
  saveInvestigation,
  type InvestigationMeta,
  type LoadResult,
} from './investigation';

const DB_NAME = 'excabit';
const DB_VERSION = 1;
const STORE = 'autosave';
/** Una sola sesión en curso: es un autosave, no un historial. */
const KEY = 'current';
const DEFAULT_DEBOUNCE_MS = 800;

export interface AutosaveOptions {
  debounceMs?: number;
  dbName?: string;
}

/** Lo justo para decidir si merece la pena ofrecer restaurar, sin parsear todo. */
export interface AutosaveSnapshot {
  text: string;
  updatedAt: string;
  nodeCount: number;
}

interface StoredRecord {
  text: string;
  updatedAt: string;
  nodeCount: number;
}

export class Autosave {
  private readonly debounceMs: number;
  private readonly dbName: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: { state: InvestigationState; meta: InvestigationMeta } | undefined;

  constructor(options: AutosaveOptions = {}) {
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.dbName = options.dbName ?? DB_NAME;
  }

  /**
   * Abre la base. No se cachea la conexión a propósito: abrir es barato, y una
   * conexión viva bloquea los `onupgradeneeded` de otras pestañas de la misma
   * app — un fallo que solo aparece con dos pestañas abiertas y cuesta media
   * tarde encontrar.
   */
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('no se pudo abrir IndexedDB'));
      };
    });
  }

  private transact<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return this.open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(STORE, mode);
          const request = run(tx.objectStore(STORE));

          request.onsuccess = () => {
            resolve(request.result);
          };
          request.onerror = () => {
            reject(request.error ?? new Error('falló la operación en IndexedDB'));
          };
          tx.oncomplete = () => {
            db.close();
          };
        }),
    );
  }

  /** Guarda ya. Lo llama el debounce; también sirve suelto. */
  async save(state: InvestigationState, meta: InvestigationMeta): Promise<void> {
    const record: StoredRecord = {
      text: saveInvestigation(state, meta),
      updatedAt: new Date().toISOString(),
      nodeCount: Object.keys(state.graph.nodes).length,
    };

    await this.transact('readwrite', (store) => store.put(record, KEY));
  }

  /** Programa un guardado. Llamadas seguidas colapsan en una. */
  schedule(state: InvestigationState, meta: InvestigationMeta): void {
    this.pending = { state, meta };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.debounceMs);
  }

  /**
   * Escribe lo pendiente sin esperar al debounce.
   *
   * Para `beforeunload`: cerrar la pestaña no puede costar los últimos cambios
   * solo porque faltaban 300 ms.
   */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;

    const pending = this.pending;
    if (pending === undefined) return;

    this.pending = undefined;
    await this.save(pending.state, pending.meta);
  }

  async read(): Promise<AutosaveSnapshot | null> {
    // `store.get` devuelve `IDBRequest<any>`: IndexedDB no sabe qué guardamos.
    // El tipo se afirma aquí, en el único punto donde entran datos de fuera.
    const record = await this.transact<StoredRecord | undefined>(
      'readonly',
      (store) => store.get(KEY) as IDBRequest<StoredRecord | undefined>,
    );
    if (record === undefined) return null;

    return { text: record.text, updatedAt: record.updatedAt, nodeCount: record.nodeCount };
  }

  /**
   * Lo guardado, ya parseado. `null` = no había nada.
   *
   * Devuelve el `LoadResult` tal cual, con su error si lo hay: un autosave a
   * medio escribir por un cierre brusco no puede impedir arrancar. Perder el
   * autosave es malo; no poder abrir la app es peor.
   */
  async restore(): Promise<LoadResult | null> {
    const snapshot = await this.read();
    if (snapshot === null) return null;

    return loadInvestigation(snapshot.text);
  }

  async clear(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
    await this.transact('readwrite', (store) => store.delete(KEY));
  }

  /** Escribe texto crudo. Solo para probar qué pasa con un autosave corrupto. */
  async writeRaw(text: string): Promise<void> {
    const record: StoredRecord = { text, updatedAt: new Date().toISOString(), nodeCount: 0 };
    await this.transact('readwrite', (store) => store.put(record, KEY));
  }
}
