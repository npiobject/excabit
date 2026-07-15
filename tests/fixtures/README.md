# Fixtures reales congelados (mempool.space)

Respuestas reales de la API Esplora de mempool.space, congeladas para que los
tests no dependan de la red (docs/04 §Fixtures reales, docs/09 §Fase 1).

**No editar a mano.** Si hace falta refrescarlos, se vuelven a descargar:

```bash
curl -s "https://mempool.space/api/tx/<txid>"           -o tests/fixtures/mempool/tx-<8 primeros>.json
curl -s "https://mempool.space/api/tx/<txid>/outspends" -o tests/fixtures/mempool/outspends-<8 primeros>.json
```

Las tx confirmadas son inmutables, así que estos ficheros no caducan. Lo único
que puede cambiar es `outspends`: un output hoy sin gastar puede gastarse mañana.

## Qué demuestra cada uno

| Fichero | Txid | Por qué está aquí |
|---|---|---|
| `tx-85e72c08` | `85e72c08…4b70f2` | Semilla del legacy y caso canónico del normalizer: 2 vin, 2 vout p2pkh, `fee` 10 000 sats, altura 300 000. Σvin − Σvout = fee. |
| `tx-993ced02` | `993ced02…c80415a` | 1 vin, 2 vout bech32 v0 (p2wpkh). Caso típico pago+cambio. |
| `tx-1d053e14` | `1d053e14…d50e912` | 2 vin, 3 vout mezclando p2wpkh y p2pkh: tipos heterogéneos. |
| `tx-aaeb5265` | `aaeb5265…8f8d530b` | 28 entradas (de `old/clases/txs`). Vector de CIOH (H-09) y de rendimiento. |
| `tx-b75ca310` | `b75ca310…736f5fb4` | **Coinbase** del bloque 800 000: `vin[0].prevout` es `null`, `txid` todo ceros, `vout` 4294967295, `fee` 0. El caso que hace crashear a los normalizers ingenuos. |
| `tx-c2f59c6f` | `c2f59c6f…6a824ea17` | **Taproot**: gasta y crea `v1_p2tr`. Vector de BUG-010 (el legacy confundía bc1p con bech32 v0). |
| `tx-3ddb2ad2` | `3ddb2ad2…d9427045` | **CoinJoin** (Whirlpool): 5 entradas y 5 salidas de exactamente 1 000 000 sats. Vector de H-09 y del detector de CoinJoin. |
| `tx-fa0e80b4` | `fa0e80b4…65875e1b` | **OP_RETURN** en tx normal: `vout[0]` sin dirección y de valor 0 → `scriptType: 'unknown'`, `address: undefined`. |

Cada `tx-*.json` tiene su `outspends-*.json` correspondiente (`GET /api/tx/:txid/outspends`),
que alimenta `vout.spent` / `vout.spentBy`.

## Casos que NO se congelan

- **Tx sin confirmar**: por definición cambia de estado; se construye con
  `txFixture({ blockHeight: null, blockTime: null })` en `tests/helpers/`.
