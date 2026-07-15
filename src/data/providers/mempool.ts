/**
 * Proveedor mempool.space / Esplora — el único de la app (ADR-002).
 *
 * Sin claves: el legacy llevaba dos claves de NowNodes incrustadas en el
 * cliente y publicadas (BUG-001), y acabaron caducando y dejando la app
 * inservible. Aquí no hay secreto que filtrar ni que caduque.
 *
 * `baseUrl` permite apuntar a una instancia propia de Esplora: misma API, sin
 * clave, soberanía completa.
 */
import type {
  AddressId,
  AddressSummary,
  Network,
  NormalizedTx,
  OutspendStatus,
  Page,
  Txid,
} from '@/core/types';
import type { ApiClient } from '../api-client';
import { ApiError } from '../errors';
import { TtlLruCache, TTL, type TtlMs } from '../cache';
import { RateLimiter, type RateLimiterOptions } from '../rate-limiter';
import { normalizeTx, normalizeOutspends } from '../normalizer';
import { classifyAddress, normalizeTxid } from '@/core/validators';
import type { EsploraAddress, EsploraOutspend, EsploraTx } from './esplora-types';

const PUBLIC_HOST = 'https://mempool.space';

/** Tamaño de página de Esplora en `/address/:addr/txs`. */
const ESPLORA_PAGE_SIZE = 25;

const NETWORK_PATH: Record<Network, string> = {
  mainnet: '/api',
  testnet: '/testnet/api',
  signet: '/signet/api',
};

export interface MempoolProviderOptions {
  network?: Network;
  /** URL base completa de una instancia Esplora propia; ignora `network`. */
  baseUrl?: string;
  cache?: TtlLruCache;
  limiter?: RateLimiter | RateLimiterOptions;
}

function resolveBaseUrl(options: MempoolProviderOptions): string {
  const base = options.baseUrl ?? `${PUBLIC_HOST}${NETWORK_PATH[options.network ?? 'mainnet']}`;

  return base.replace(/\/+$/, '');
}

function toLimiter(limiter: MempoolProviderOptions['limiter']): RateLimiter {
  if (limiter instanceof RateLimiter) return limiter;

  return new RateLimiter(limiter ?? {});
}

/** Traduce el resultado HTTP a un error del dominio (docs/05 §4). */
function errorForStatus(status: number, body: string): ApiError {
  if (status === 404) return new ApiError('not-found', `No encontrado: ${body}`, { status });
  if (status === 429 || status === 503) {
    return new ApiError('rate-limited', 'El proveedor pide bajar el ritmo', { status });
  }
  if (status >= 500)
    return new ApiError('network', `Error del proveedor (${String(status)})`, { status });

  return new ApiError('invalid', `Respuesta inesperada (${String(status)}): ${body}`, { status });
}

export class MempoolProvider implements ApiClient {
  private readonly baseUrl: string;
  private readonly cache: TtlLruCache;
  private readonly limiter: RateLimiter;

  constructor(options: MempoolProviderOptions = {}) {
    this.baseUrl = resolveBaseUrl(options);
    this.cache = options.cache ?? new TtlLruCache();
    this.limiter = toLimiter(options.limiter);
  }

  /**
   * Una sola puerta de salida a la red. Comprueba `response.ok` SIEMPRE
   * (BUG-002 lo omitía) y convierte cualquier fallo en `ApiError`: nada de
   * `alert()` ni de errores disfrazados de datos (BUG-003).
   */
  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch (cause) {
      // fetch solo rechaza por fallo de transporte; un 4xx/5xx resuelve normal.
      throw new ApiError('network', 'No se pudo contactar con el proveedor', { cause });
    }

    if (!response.ok) {
      throw errorForStatus(response.status, (await response.text().catch(() => '')).slice(0, 200));
    }

    try {
      return (await response.json()) as T;
    } catch (cause) {
      throw new ApiError('invalid', 'El proveedor devolvió algo que no es JSON', { cause });
    }
  }

  /** Pide a través de caché y limitador: 1 fetch por clave, sin pasarse de ritmo. */
  private fetchThrough<T>(key: string, path: string, ttl: TtlMs): Promise<T> {
    return this.cache.through(key, () => this.limiter.schedule(() => this.request<T>(path)), ttl);
  }

  private assertTxid(txid: string): Txid {
    const valid = normalizeTxid(txid);
    if (valid === null) {
      throw new ApiError('invalid', `Txid inválido: ${txid.slice(0, 80)}`);
    }

    return valid;
  }

  async getTx(txid: Txid): Promise<NormalizedTx> {
    const id = this.assertTxid(txid);
    const raw = await this.fetchThrough<EsploraTx>(`tx:${id}`, `/tx/${id}`, TTL.UNCONFIRMED);

    const tx = normalizeTx(raw);

    // Una tx confirmada es inmutable: se recachea sin caducidad. Así una
    // sesión larga no vuelve a pedir jamás lo que no puede cambiar.
    if (tx.blockHeight !== null) this.cache.set(`tx:${id}`, raw, TTL.CONFIRMED);

    return tx;
  }

  async getOutspends(txid: Txid): Promise<OutspendStatus[]> {
    const id = this.assertTxid(txid);
    const raw = await this.fetchThrough<EsploraOutspend[]>(
      `outspends:${id}`,
      `/tx/${id}/outspends`,
      TTL.OUTSPENDS,
    );

    return normalizeOutspends(raw);
  }

  async getAddress(address: AddressId): Promise<AddressSummary> {
    const type = classifyAddress(address);
    if (type === 'unknown') {
      throw new ApiError('invalid', `Dirección inválida: ${address.slice(0, 80)}`);
    }

    const raw = await this.fetchThrough<EsploraAddress>(
      `addr:${address}`,
      `/address/${address}`,
      TTL.ADDRESS,
    );

    // El saldo real incluye lo que aún está en mempool.
    const received =
      BigInt(raw.chain_stats.funded_txo_sum) + BigInt(raw.mempool_stats.funded_txo_sum);
    const spent = BigInt(raw.chain_stats.spent_txo_sum) + BigInt(raw.mempool_stats.spent_txo_sum);

    return {
      address: raw.address,
      type,
      txCount: raw.chain_stats.tx_count + raw.mempool_stats.tx_count,
      received,
      spent,
      balance: received - spent,
    };
  }

  async getAddressTxs(address: AddressId, cursor?: string): Promise<Page<NormalizedTx>> {
    const type = classifyAddress(address);
    if (type === 'unknown') {
      throw new ApiError('invalid', `Dirección inválida: ${address.slice(0, 80)}`);
    }

    const path =
      cursor === undefined ? `/address/${address}/txs` : `/address/${address}/txs/chain/${cursor}`;

    const raw = await this.fetchThrough<EsploraTx[]>(
      `addrtxs:${address}:${cursor ?? 'first'}`,
      path,
      TTL.ADDRESS,
    );

    const items = raw.map(normalizeTx);
    // Esplora no da cursor: se pagina con el último txid visto. Si la página
    // viene incompleta, es la última.
    const last = items.at(-1);
    const hasMore = items.length === ESPLORA_PAGE_SIZE && last !== undefined;

    return hasMore ? { items, cursor: last.txid } : { items };
  }
}
