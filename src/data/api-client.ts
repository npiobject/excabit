/**
 * Contrato de acceso a datos de la cadena (docs/05 §4).
 *
 * El resto de la app depende de ESTA interfaz, no de mempool.space. La ADR-002
 * eligió un proveedor único sin clave; si algún día se revisa, lo que cambia
 * es la implementación de `providers/`, no los consumidores.
 */
import type {
  AddressId,
  AddressSummary,
  NormalizedTx,
  OutspendStatus,
  Page,
  Txid,
} from '@/core/types';

export interface ApiClient {
  getTx(txid: Txid): Promise<NormalizedTx>;
  getAddress(address: AddressId): Promise<AddressSummary>;
  /** Paginado: `cursor` es opaco para el llamante (RF-31). */
  getAddressTxs(address: AddressId, cursor?: string): Promise<Page<NormalizedTx>>;
  getOutspends(txid: Txid): Promise<OutspendStatus[]>;
}
