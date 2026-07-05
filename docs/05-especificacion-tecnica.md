---
documento: Especificación técnica y ADRs
proyecto: excabit v2
estado: borrador
version: 0.1
fecha: 2026-07-04
---

# 05 — Especificación técnica

## 1. Stack

| Capa | Elección |
|---|---|
| Build | Vite |
| Lenguaje | TypeScript `strict` |
| Grafo | Cytoscape.js (ADR-001) |
| UI shell | HTML/CSS/TS vanilla, Web Components ligeros donde aporte (ADR-003) |
| Tests | Vitest (+coverage) unit/integración, MSW para red, Playwright E2E |
| Calidad | ESLint + Prettier, gitleaks en CI (GitHub Actions) |
| Deploy | GitHub Pages (estático, como el legacy) |

## 2. Módulos y responsabilidades

```
src/
  main.ts                 # bootstrap y wiring; único sitio donde se conectan capas
  core/
    types.ts              # Txid, Address, NormalizedTx, Vin/Vout; satoshis como bigint
    graph-model.ts        # nodos (tx | address | cluster) y aristas; agnóstico de render
    store.ts              # estado de la investigación + emisor de eventos (única fuente de verdad)
    commands.ts           # patrón Command: AddTx, MoveNode, SetLabel, SetColor, DeleteSelection,
                          #   GroupCluster… cada uno con do()/undo() simétricos
    undo.ts               # pila undo/redo sobre comandos (RF-28; sustituye BUG-013)
  data/
    api-client.ts         # interfaz ApiClient { getTx, getAddress, getAddressTxs, getOutspends }
    providers/mempool.ts  # implementación mempool.space/Esplora — ÚNICO proveedor, sin clave;
                          #   URL base configurable para instancia autohospedada
    cache.ts              # caché tx+addr+outspends, TTL y límite LRU (corrige BUG-002/004)
    rate-limiter.ts       # cola con backoff exponencial (RNF-04)
    normalizer.ts         # respuesta del provider → NormalizedTx (aísla diferencias de API)
  analysis/
    address-type.ts       # clasificación única de direcciones (corrige BUG-006)
    heuristics/           # h01-change-largest-output.ts … h09-common-input-ownership.ts
    score.ts              # privacyScore agregado
    clustering.ts         # CIOH → clusters (RF-19)
    taint.ts              # seguimiento de flujo de fondos (RF-18)
  graph/
    cy-adapter.ts         # ÚNICA frontera con Cytoscape: crea instancia, sincroniza con graph-model
    layout-radial.ts      # posiciones preset que replican el radial del legacy (tx centro, I/O satélites)
    styles.ts             # stylesheet Cytoscape desde tokens CSS
    interactions.ts       # máquina de estados de interacción (corrige BUG-017)
    minimap.ts
  ui/
    toolbar.ts  side-panel.ts  command-palette.ts  search-box.ts
    shortcuts.ts          # registro central: cada acción declara {id, atajo, icono, i18nKey}
    toasts.ts  theme.css  tour.ts
  persistence/
    investigation.ts      # save/load .excabit.json versionado + migrador legacy (RF-21)
    autosave.ts           # IndexedDB (RF-22)
    export.ts             # PNG/SVG/CSV (RF-23/24)
  i18n/
    i18n.ts  es.json  en.json
```

**Regla arquitectónica (verificable con eslint-plugin-boundaries):** `core/`, `data/`, `analysis/` y `persistence/` **no importan** Cytoscape ni DOM. Consecuencias: testeables en Node sin navegador; Cytoscape sustituible tocando solo `graph/`.

**Flujo de datos:** UI/interacciones → despachan **Commands** → mutan el **store** → eventos → `cy-adapter` y paneles se actualizan. La red nunca muta el store directamente: los fetch resuelven a comandos (`AddTxData`).

## 3. Modelo de datos (extracto)

```ts
type Txid = string;          // 64 hex, validado en frontera
type AddressId = string;

interface NormalizedTx {
  txid: Txid;
  version: number;
  locktime: number;
  blockHeight: number | null;      // null = sin confirmar
  blockTime: number | null;        // epoch s
  fee: bigint;                     // sats
  size: number; weight: number;
  vin: Array<{ txid: Txid; vout: number; value: bigint; address?: AddressId; sequence: number }>;
  vout: Array<{ n: number; value: bigint; address?: AddressId; scriptType: AddressType; spent?: boolean }>;
}

interface Investigation {                 // schema de .excabit.json
  schemaVersion: 2;                       // v1 = formato del legacy (migrador)
  network: 'mainnet' | 'testnet' | 'signet';
  createdAt: string; updatedAt: string;   // ISO
  rootTxid: Txid;
  nodes: Array<{ id: string; kind: 'tx' | 'address' | 'cluster';
                 x: number; y: number; label?: string; color?: string; note?: string;
                 parent?: string /* cluster */ }>;
  edges: Array<{ from: string; to: string; kind: 'input' | 'output'; value: bigint /* serializado como string */ }>;
  viewport?: { zoom: number; panX: number; panY: number };
}
```

Migrador legacy: el JSON del `save` antiguo (`posiTxs`, `posiAddrs`, `anchoTx`, `altoTx`, `radioSatelites`, flags) se transforma a `Investigation v2`; los campos sin equivalente (sombra, rayado) se descartan con aviso. Validación con zod al importar (corrige BUG-019).

## 4. Contrato ApiClient y política de errores

```ts
interface ApiClient {
  getTx(txid: Txid): Promise<NormalizedTx>;
  getAddress(addr: AddressId): Promise<AddressSummary>;
  getAddressTxs(addr: AddressId, cursor?: string): Promise<Page<NormalizedTx>>;
  getOutspends(txid: Txid): Promise<Array<{ spent: boolean; txid?: Txid }>>;
}
```

- Toda respuesta pasa por `normalizer` → el resto de la app no conoce el formato del provider.
- Comprobación de `response.ok` obligatoria; errores tipados `ApiError { kind: 'network' | 'not-found' | 'rate-limited' | 'invalid' }` (corrige BUG-002/003).
- Reintentos: 3 con backoff exponencial + jitter solo para `network`/`rate-limited`.
- Caché: LRU 500 entradas, TTL 10 min para tx confirmadas ∞ (inmutables), 30 s para no confirmadas y direcciones. **Test de regresión BUG-002: lo cacheado nunca es thenable.**
- Prohibido `alert()`; los errores llegan a la UI como toasts con acción de reintento (RF-29).

Endpoints mempool.space (default): `/api/tx/:txid`, `/api/tx/:txid/outspends`, `/api/address/:addr`, `/api/address/:addr/txs` (paginado). Mismas rutas en testnet/signet bajo `/testnet/api`… La API es Esplora-compatible → el usuario puede configurar la URL base de su propio nodo.

## 5. ADRs

### ADR-001 — Cytoscape.js como motor del grafo (aceptada)
- **Contexto:** el grafo es el corazón de la app; necesita drag individual/grupal, zoom/pan, expansión incremental, selección por área, estilos por nodo, compound nodes.
- **Opciones:** (A) motor propio canvas/WebGL; (B) Cytoscape.js; (C) Sigma.js; (D) D3; (E) mantener p5.
- **Decisión:** B. Todas las necesidades son features core de Cytoscape; Sigma gana solo en grafos de >50k nodos (excabit maneja cientos); D3 es una caja de herramientas (equivale a A); p5 es immediate-mode sin escena ni hit-testing y es la raíz de la clase-dios del legacy.
- **Consecuencias:** dependencia de ~400 KB (aceptable frente a los 4,3 MB de p5 legacy); frontera única en `graph/cy-adapter.ts` para poder revisar la decisión. **Riesgo controlado:** spike del layout radial `preset` al inicio de la Fase 3; es el único punto que podría reabrir esta ADR.

### ADR-002 — mempool.space sin clave como proveedor único de datos (aceptada)
- **Contexto:** el legacy exponía claves NowNodes en el cliente (BUG-001); una app estática no puede guardar secretos.
- **Opciones:** (A) proxy serverless con clave propia; (B) clave aportada por usuario; (C) API pública sin clave.
- **Decisión:** C — **mempool.space (API Esplora), sin clave, como proveedor único para todas las consultas** (decisión del propietario, 2026-07-05; refrendada al comprobarse que la clave NowNodes del legacy estaba caducada y la app publicada inoperativa). No se implementan providers con clave. Única variación admitida: URL base configurable hacia una instancia autohospedada de mempool/Esplora (misma API, sin clave). A y B quedan descartadas; reabrir solo con nueva ADR.
- **Consecuencias:** cero secretos en el repo y cero gestión de claves en la UI; app 100% estática; un solo normalizador que mantener; rate-limiting cliente obligatorio (RNF-04); soberanía vía nodo propio.

### ADR-003 — Sin framework de UI (aceptada)
- **Contexto:** el DOM de la app es pequeño (toolbar, panel, palette, toasts); el grafo lo gestiona Cytoscape.
- **Decisión:** TS vanilla + Web Components ligeros. Sin React/Vue/Svelte: evitan ~40-60 KB y una capa de abstracción que no aporta con este tamaño de DOM.
- **Consecuencias:** disciplina manual en el patrón store→render de los paneles; si el shell creciera mucho, revisar con nueva ADR (lit sería el paso natural).

### ADR-004 — Undo/redo por comandos sobre datos (aceptada)
- **Contexto:** el legacy guardaba capturas de imagen del canvas (BUG-013): memoria ilimitada y datos incoherentes tras deshacer.
- **Decisión:** patrón Command con `do()/undo()` simétricos sobre el store; pila limitada (200 entradas) con coalescing de drags (un drag = un comando).
- **Consecuencias:** RF-28 testeable por propiedad; serialización futura del historial casi gratis.

## 6. Convenciones

- Código e identificadores en **inglés**; UI bilingüe ES/EN vía i18n (el legacy mezclaba español en código).
- Commits convencionales; una feature = una rama = specs+tests+código.
- Importes siempre `bigint` sats en dominio; formateo (BTC, separadores es-ES) solo en la capa UI.
- Cobertura mínima: `core/`+`data/` ≥ 90%, `analysis/` ≥ 95% (donde vivían los bugs silenciosos del legacy).
