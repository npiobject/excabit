/**
 * Panel lateral: Detalles, Heurísticas e Investigación (RF-15/16/25, docs/06 §2).
 *
 * La pestaña Heurísticas es la propuesta de valor nº 3 del producto (docs/00):
 * cada heurística se muestra **con su explicación y su nivel de confianza**, no
 * como un veredicto de caja negra. En la tx de ejemplo dos heurísticas se
 * contradicen (H-07 dice cambio, H-02 dice pago) y H-07 acierta: por eso se
 * ordenan por confianza y se enseña la de más peso primero, en vez de fingir un
 * consenso que no existe.
 */
import type { GraphNode } from '@/core/graph-model';
import { analyzeTx } from '@/analysis/score';
import type { HeuristicResult } from '@/analysis/types';
import { t, type MessageKey } from '@/i18n/i18n';
import {
  formatBtc,
  formatDate,
  formatFeerate,
  formatNumber,
  formatSats,
  shortHash,
} from '@/i18n/format';

export type PanelTab = 'details' | 'heuristics' | 'investigation';

const CONFIDENCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3 };
const OUTCOME_ORDER: Record<string, number> = {
  detected: 0,
  'insufficient-data': 1,
  'not-applicable': 2,
};

export class SidePanel {
  private readonly root: HTMLElement;
  private readonly panes: Record<PanelTab, HTMLElement>;
  private readonly tabs: Record<PanelTab, HTMLButtonElement>;
  private current: PanelTab = 'details';
  private selected: GraphNode | undefined;

  constructor(root: HTMLElement) {
    this.root = root;
    this.panes = {
      details: this.require('#paneDetails'),
      heuristics: this.require('#paneHeuristics'),
      investigation: this.require('#paneInvestigation'),
    };
    this.tabs = {
      details: this.requireButton('#tabDetails'),
      heuristics: this.requireButton('#tabHeuristics'),
      investigation: this.requireButton('#tabInvestigation'),
    };

    for (const [name, tab] of Object.entries(this.tabs)) {
      tab.addEventListener('click', () => {
        this.show(name as PanelTab);
      });
      // Las pestañas se recorren con flechas, como manda el patrón ARIA.
      tab.addEventListener('keydown', (event) => {
        this.onTabKeydown(event);
      });
    }

    this.show('details');
  }

  private require(selector: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (element === null) throw new Error(`Falta ${selector} en el panel`);

    return element;
  }

  private requireButton(selector: string): HTMLButtonElement {
    const element = this.require(selector);
    if (!(element instanceof HTMLButtonElement)) throw new Error(`${selector} no es un botón`);

    return element;
  }

  private onTabKeydown(event: KeyboardEvent): void {
    const order: PanelTab[] = ['details', 'heuristics', 'investigation'];
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;

    event.preventDefault();
    const next = order[(order.indexOf(this.current) + delta + order.length) % order.length];
    if (next === undefined) return;

    this.show(next);
    this.tabs[next].focus();
  }

  show(tab: PanelTab): void {
    this.current = tab;

    for (const [name, pane] of Object.entries(this.panes)) {
      const active = name === tab;
      pane.hidden = !active;
      this.tabs[name as PanelTab].setAttribute('aria-selected', String(active));
      this.tabs[name as PanelTab].tabIndex = active ? 0 : -1;
    }
  }

  get activeTab(): PanelTab {
    return this.current;
  }

  /** Un nodo seleccionado (o ninguno) redibuja Detalles y Heurísticas. */
  setSelection(node: GraphNode | undefined): void {
    this.selected = node;
    this.renderDetails();
    this.renderHeuristics();
  }

  private renderDetails(): void {
    const pane = this.panes.details;
    pane.textContent = '';

    if (this.selected === undefined) {
      pane.append(muted(t('panel.empty')));
      return;
    }

    if (this.selected.kind === 'address') {
      this.renderAddressDetails(pane, this.selected);
      return;
    }

    const tx = this.selected.tx;
    if (tx === undefined) {
      pane.append(muted(t('panel.empty')));
      return;
    }

    pane.append(copyableHash(tx.txid));

    const total = tx.vout.reduce((sum, out) => sum + out.value, 0n);
    const rows: [MessageKey, string][] = [
      [
        'details.status',
        tx.blockHeight === null ? t('details.unconfirmed') : t('details.confirmed'),
      ],
      ['details.block', tx.blockHeight === null ? '—' : formatNumber(tx.blockHeight)],
      ['details.date', tx.blockTime === null ? '—' : formatDate(tx.blockTime)],
      ['details.amount', formatBtc(total)],
      ['details.fee', formatSats(tx.fee)],
      ['details.feerate', formatFeerate(tx.fee, tx.weight)],
      ['details.size', `${formatNumber(tx.size)} B · ${formatNumber(tx.weight)} WU`],
      ['details.inputs', `${String(tx.vin.length)} (${typesOf(tx.vin.map((i) => i.scriptType))})`],
      [
        'details.outputs',
        `${String(tx.vout.length)} (${typesOf(tx.vout.map((o) => o.scriptType))})`,
      ],
      ['details.version', `${String(tx.version)} · ${String(tx.locktime)}`],
      [
        'details.rbf',
        tx.vin.some((vin) => vin.sequence < 0xfffffffe) ? t('details.rbfYes') : t('details.rbfNo'),
      ],
    ];

    const list = document.createElement('dl');
    for (const [key, value] of rows) list.append(row(t(key), value));
    pane.append(list);

    const link = document.createElement('a');
    link.className = 'link';
    link.href = `https://mempool.space/tx/${tx.txid}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `${t('details.viewOnMempool')} ↗`;
    pane.append(link);
  }

  private renderAddressDetails(pane: HTMLElement, node: GraphNode): void {
    pane.append(copyableHash(node.address ?? ''));

    const list = document.createElement('dl');
    list.append(row(t('details.address'), shortHash(node.address ?? '', 8, 8)));
    pane.append(list);

    const link = document.createElement('a');
    link.className = 'link';
    link.href = `https://mempool.space/address/${node.address ?? ''}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `${t('details.viewOnMempool')} ↗`;
    pane.append(link);
  }

  private renderHeuristics(): void {
    const pane = this.panes.heuristics;
    pane.textContent = '';

    const tx = this.selected?.tx;
    if (tx === undefined) {
      pane.append(muted(t('heuristics.empty')));
      return;
    }

    const analysis = analyzeTx(tx);

    const box = document.createElement('div');
    box.id = 'scoreBox';
    box.className = analysis.badge;
    box.innerHTML = `<strong id="scoreValue">${String(analysis.score)}</strong><span>${t('heuristics.score')}</span>`;
    pane.append(box);

    // Primero lo detectado y, dentro, lo de más confianza: si dos heurísticas
    // se contradicen, la de más peso se lee antes.
    const sorted = [...analysis.results].sort(
      (a, b) =>
        (OUTCOME_ORDER[a.outcome] ?? 9) - (OUTCOME_ORDER[b.outcome] ?? 9) ||
        (CONFIDENCE_ORDER[a.confidence] ?? 9) - (CONFIDENCE_ORDER[b.confidence] ?? 9),
    );

    for (const result of sorted) pane.append(heuristicRow(result));
  }

  renderInvestigation(nodes: GraphNode[]): void {
    const pane = this.panes.investigation;
    pane.textContent = '';

    if (nodes.length === 0) {
      pane.append(muted(t('investigation.empty')));
      return;
    }

    const list = document.createElement('dl');
    for (const node of nodes) {
      const name =
        node.label ??
        (node.kind === 'tx'
          ? shortHash(node.tx?.txid ?? node.id)
          : shortHash(node.address ?? node.id));
      list.append(row(node.kind, name));
    }
    pane.append(list);
  }
}

function muted(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = text;

  return p;
}

function row(label: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const wrapper = document.createElement('div');
  wrapper.className = 'row';

  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;

  wrapper.append(dt, dd);
  fragment.append(wrapper);

  return fragment;
}

/** Hash completo con copy-on-click (RF-15). */
function copyableHash(value: string): HTMLElement {
  const button = document.createElement('button');
  button.className = 'hash';
  button.type = 'button';
  button.title = value;
  button.textContent = value;

  button.addEventListener('click', () => {
    void navigator.clipboard.writeText(value).then(() => {
      const original = button.textContent;
      button.textContent = t('details.copied');
      setTimeout(() => (button.textContent = original), 900);
    });
  });

  return button;
}

function heuristicRow(result: HeuristicResult): HTMLElement {
  const item = document.createElement('div');
  item.className = `heuristic ${result.outcome}`;
  item.dataset['heuristic'] = result.id;

  const outcomeKey: MessageKey =
    result.outcome === 'detected'
      ? 'heuristics.detected'
      : result.outcome === 'insufficient-data'
        ? 'heuristics.insufficientData'
        : 'heuristics.notApplicable';

  const head = document.createElement('div');
  head.className = 'heuristic-head';
  head.innerHTML = `
    <i class="semaphore" aria-hidden="true"></i>
    <span class="heuristic-name">${t(`heuristic.${result.id}.name` as MessageKey)}</span>
    <span class="heuristic-conf">${t(outcomeKey)}${
      result.outcome === 'detected'
        ? ` · ${t(`heuristics.confidence.${result.confidence}` as MessageKey)}`
        : ''
    }</span>`;

  const description = document.createElement('p');
  description.textContent = t(`heuristic.${result.id}.description` as MessageKey);

  item.append(head, description);

  return item;
}

/** «p2pkh, p2wpkh» sin repetir, para la fila de entradas/salidas. */
const typesOf = (types: string[]): string => [...new Set(types)].join(', ');
