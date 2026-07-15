/**
 * Formateo dependiente del idioma (docs/05 §6: el dominio va en satoshis
 * `bigint`; el formateo vive aquí y solo aquí).
 *
 * Está en `i18n/` y no en `ui/` porque también lo necesita `graph/` para las
 * etiquetas de los nodos, y la regla de fronteras prohíbe `graph → ui`. Al fin
 * y al cabo, formatear un importe es traducirlo a la convención del lector.
 */
import { getLocale } from './i18n';

const SATS_PER_BTC = 100_000_000n;

/**
 * Satoshis → BTC con 8 decimales.
 *
 * Se divide en `bigint` y se compone la cadena a mano: pasar por `Number`
 * reintroduciría el error de coma flotante que el dominio evita usando bigint.
 */
export function formatBtc(sats: bigint): string {
  const negative = sats < 0n;
  const absolute = negative ? -sats : sats;
  const whole = absolute / SATS_PER_BTC;
  const fraction = (absolute % SATS_PER_BTC).toString().padStart(8, '0');
  const grouped = whole.toLocaleString(getLocale() === 'es' ? 'es-ES' : 'en-US');

  return `${negative ? '−' : ''}${grouped}.${fraction} BTC`;
}

export function formatSats(sats: bigint): string {
  return `${sats.toLocaleString(getLocale() === 'es' ? 'es-ES' : 'en-US')} sats`;
}

/** Hash truncado como en el mock: `85e72c…4b70f2`. */
export function shortHash(hash: string, head = 6, tail = 6): string {
  return hash.length <= head + tail + 1 ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function formatDate(epochSeconds: number): string {
  const date = new Date(epochSeconds * 1000);

  return new Intl.DateTimeFormat(getLocale() === 'es' ? 'es-ES' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatNumber(value: number): string {
  return value.toLocaleString(getLocale() === 'es' ? 'es-ES' : 'en-US');
}

/** sat/vB. El peso va en unidades de peso: vbytes = weight / 4. */
export function formatFeerate(fee: bigint, weight: number): string {
  if (weight === 0) return '—';

  const vbytes = weight / 4;
  const rate = Number(fee) / vbytes;

  return `${rate.toFixed(1).replace('.', getLocale() === 'es' ? ',' : '.')} sat/vB`;
}
