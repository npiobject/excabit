/**
 * Demo de la Fase 2 (criterio de salida, docs/08): analiza un txid real contra
 * mempool.space e imprime sus heurísticas de privacidad.
 *
 *   npm run analyze                 # usa la tx de ejemplo del legacy
 *   npm run analyze -- <txid>
 *   npm run analyze -- <txid> testnet
 *
 * Que esto funcione en Node, sin navegador y sin mocks, es la prueba de que la
 * regla arquitectónica se sostiene: `analysis/` y `data/` no tocan el DOM.
 */
import { MempoolProvider } from '../src/data/providers/mempool';
import { analyzeTx } from '../src/analysis/score';
import { isApiError } from '../src/data/errors';
import type { Network } from '../src/core/types';

const EXAMPLE_TXID = '85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2';

const SYMBOL: Record<string, string> = {
  detected: '●',
  'not-applicable': '·',
  'insufficient-data': '?',
};

function formatSats(sats: bigint): string {
  const btc = Number(sats) / 1e8;

  return `${btc.toFixed(8)} BTC`;
}

async function main(): Promise<void> {
  const [txidArg, networkArg] = process.argv.slice(2);
  const txid = txidArg ?? EXAMPLE_TXID;
  const network = (networkArg ?? 'mainnet') as Network;

  const provider = new MempoolProvider({ network });
  const tx = await provider.getTx(txid);
  const analysis = analyzeTx(tx);

  console.log(`\n  tx ${tx.txid}`);
  console.log(
    `  ${String(tx.vin.length)} entradas → ${String(tx.vout.length)} salidas · fee ${formatSats(tx.fee)}`,
  );
  console.log(
    `  ${tx.blockHeight === null ? 'sin confirmar' : `bloque ${String(tx.blockHeight)}`}\n`,
  );

  for (const result of analysis.results) {
    const symbol = SYMBOL[result.outcome] ?? '·';
    const detail = result.details === undefined ? '' : `  ${JSON.stringify(result.details)}`;
    const confidence = result.outcome === 'detected' ? ` (${result.confidence})` : '';

    console.log(`  ${symbol} ${result.id.padEnd(24)} ${result.outcome}${confidence}${detail}`);
  }

  console.log(`\n  privacyScore: ${String(analysis.score)}/100  [${analysis.badge}]\n`);
}

main().catch((error: unknown) => {
  // Los errores de red son datos, no excepciones que revientan (BUG-003).
  if (isApiError(error)) {
    console.error(`\n  Error (${error.kind}): ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  throw error;
});
