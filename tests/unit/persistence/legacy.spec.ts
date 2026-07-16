/**
 * Migrador del formato del legacy (RF-21, docs/05 §3).
 *
 * El fichero del legacy (`tests/fixtures/legacy-save.json`) está construido a
 * mano a partir de `old/clases/bchain.js:3640` (`saveJSON`), que es la única
 * fuente que queda: no hay ni un save real en el repo — se hosteaban aparte
 * (`exploraGraf.js:450`). Su forma está documentada en `tests/fixtures/README.md`.
 *
 * Lo que se migra es lo que puso el usuario: la estructura, dónde colocó las
 * cosas y cómo las anotó. Lo que se descarta y por qué está en cada test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isLegacyFile, migrateLegacy } from '@/persistence/legacy';
import { loadInvestigation, saveInvestigation } from '@/persistence/investigation';
import { addressNodeId, txNodeId } from '@/core/graph-model';

const legacyText = readFileSync(
  fileURLToPath(new URL('../../fixtures/legacy-save.json', import.meta.url)),
  'utf8',
);

const ROOT = '85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2';
const SECOND = '993ced02486f9aaa5a5ed943141e05e436aac054dcea78a560f0f1860c80415a';
const THIRD = '1d053e14643494a05e9a4279c42ec9f8924d52100e2e229c5e0174742d50e912';
const REUSED_ADDR = '122BNoyhmuUt9G9mdEm3mN4nb73c1UgNKt';
const BRIDGE_ADDR = 'bc1qlw6e547whyv5phqx987tfs9u8gmqv6gs9sn2lz';

const migrate = () => {
  const result = migrateLegacy(JSON.parse(legacyText));
  if (!result.ok) throw new Error(`no migró: ${JSON.stringify(result.error)}`);

  return result;
};

describe('reconocer un fichero del legacy', () => {
  it('lo detecta por su forma: nunca tuvo campo de versión', () => {
    // `saveJSON` guardaba 7 claves y ninguna decía qué formato era. La única
    // firma posible es la estructura: `posiTxs` + `posiAddrs` en la raíz.
    expect(isLegacyFile(JSON.parse(legacyText))).toBe(true);
  });

  it('no confunde un fichero v2 con uno del legacy', () => {
    expect(isLegacyFile({ schemaVersion: 2, nodes: [], edges: [] })).toBe(false);
  });

  it('no confunde cualquier JSON con uno del legacy', () => {
    expect(isLegacyFile({ type: 'application', hola: 1 })).toBe(false);
    expect(isLegacyFile(null)).toBe(false);
    expect(isLegacyFile([])).toBe(false);
    expect(isLegacyFile(42)).toBe(false);
  });
});

describe('migrar el fixture del legacy a schema v2', () => {
  it('migra las tres txs con txid real', () => {
    const { investigation } = migrate();

    expect(investigation.state.graph.nodes[txNodeId(ROOT)]).toBeDefined();
    expect(investigation.state.graph.nodes[txNodeId(SECOND)]).toBeDefined();
    expect(investigation.state.graph.nodes[txNodeId(THIRD)]).toBeDefined();
  });

  it('la raíz es posiTxs[0]: en el legacy el orden era el dato', () => {
    // `getCargaTx` hacía `idTx = posiTxs[0].idTx` (exploraGraf.js:1168). Ese
    // conocimiento implícito se vuelve explícito en v2: `rootTxid`.
    expect(migrate().investigation.rootTxid).toBe(ROOT);
  });

  it('conserva las posiciones tal cual: es la investigación del usuario', () => {
    const node = migrate().investigation.state.graph.nodes[txNodeId(ROOT)];
    expect(node).toMatchObject({ x: 400, y: 300 });
  });

  it('tagTx → label, y una etiqueta vacía no se inventa', () => {
    const { investigation } = migrate();

    expect(investigation.state.graph.nodes[txNodeId(ROOT)]?.label).toBe('Origen del robo');
    // tagTx: "" en el legacy significa «sin etiqueta», no «etiqueta vacía».
    expect(investigation.state.graph.nodes[txNodeId(SECOND)]?.label).toBeUndefined();
  });

  it('tagAddr → label también en las direcciones', () => {
    const node = migrate().investigation.state.graph.nodes[addressNodeId(REUSED_ADDR)];
    expect(node?.label).toBe('Monedero comprometido');
  });

  it('movido → pinned: si el usuario lo colocó, el layout no lo toca', () => {
    const { investigation } = migrate();

    expect(investigation.state.graph.nodes[txNodeId(ROOT)]?.pinned).toBe(true);
    expect(investigation.state.graph.nodes[txNodeId(SECOND)]?.pinned).toBeUndefined();
  });

  it('el color del usuario sale de bgColor (su paleta), no del borde', () => {
    // `grabaColorTx()` (bchain.js:1556-1584) es la paleta del usuario y escribe
    // en `bgColor`. El botón 2 era el azul.
    const node = migrate().investigation.state.graph.nodes[txNodeId(SECOND)];
    expect(node?.color).toBe('#0000ff');
  });

  it('el rojo de SELECCIÓN no se migra: era lo que estaba marcado al guardar', () => {
    // El borde `{255,77,77}` es el estado de selección (exploraGraf.js:790), no
    // una elección. Migrarlo convertiría en anotación permanente el accidente de
    // qué estaba marcado al pulsar «guardar» — la misma razón por la que la
    // selección no se guarda en v2.
    const node = migrate().investigation.state.graph.nodes[txNodeId(ROOT)];
    expect(node?.color).not.toBe('#ff4d4d');
  });

  it('el naranja de «tx expandida» tampoco: es estado, no anotación', () => {
    // `bgColor = {232,132,32}` lo pintaba el legacy al desplegar una tx
    // (exploraGraf.js:693). La raíz del fixture está expandida y seleccionada:
    // no debe salir con ningún color.
    const node = migrate().investigation.state.graph.nodes[txNodeId(ROOT)];
    expect(node?.color).toBeUndefined();
  });

  it('el gris de fábrica no se migra: era el botón «quitar color»', () => {
    // Botón 7 de la paleta = `{127,127,127}` (bchain.js:1585), que es también el
    // valor inicial. Migrarlo convertiría «sin color» en «gris elegido a mano».
    const nodes = migrate().investigation.state.graph.nodes;
    expect(nodes[addressNodeId(BRIDGE_ADDR)]?.color).toBeUndefined();
  });

  it('el canal 256 del legacy se recorta a 255 en vez de dar #10000', () => {
    // `grabaColorTx(1)` escribe `{r:256,...}` (bchain.js:1561) y 256 no es un
    // canal RGB válido: p5 lo aceptaba y lo recortaba. Sin recorte, el hex
    // saldría de 7 dígitos y el color no se vería.
    const node = migrate().investigation.state.graph.nodes[txNodeId(THIRD)];
    expect(node?.color).toBe('#ff0000');
  });

  it('las direcciones no traen color: el legacy no tenía paleta para ellas', () => {
    // No existe `grabaColorAddr`: el color de una dirección siempre fue el de
    // fábrica. Migrarlo pintaría de gris explícito lo que nadie pintó.
    const nodes = migrate().investigation.state.graph.nodes;

    for (const node of Object.values(nodes)) {
      if (node.kind === 'address') expect(node.color).toBeUndefined();
    }
  });

  it('las direcciones se vuelven nodos, no aristas', () => {
    // En el legacy `posiAddrs` era la ARISTA (idTx1 → idAddr → idTx2) y la
    // dirección no existía como entidad. Por eso no podía verse que dos txs
    // tocan la misma dirección, que es justo lo que revela H-07 y la propuesta
    // de valor del grafo.
    const { investigation } = migrate();
    const node = investigation.state.graph.nodes[addressNodeId(BRIDGE_ADDR)];

    expect(node?.kind).toBe('address');
    expect(node?.address).toBe(BRIDGE_ADDR);
  });

  it('io=O conecta pivot → dirección → satélite en el sentido correcto', () => {
    const { investigation } = migrate();
    const edges = Object.values(investigation.state.graph.edges);
    const addr = addressNodeId(BRIDGE_ADDR);

    // 993ced02 paga a la dirección…
    expect(edges).toContainEqual(
      expect.objectContaining({ from: txNodeId(SECOND), to: addr, kind: 'output' }),
    );
    // …y 1d053e14 la gasta.
    expect(edges).toContainEqual(
      expect.objectContaining({ from: addr, to: txNodeId(THIRD), kind: 'input' }),
    );
  });

  it('io=I conecta en el sentido contrario: la dirección alimenta al pivot', () => {
    const { investigation } = migrate();
    const edges = Object.values(investigation.state.graph.edges);

    expect(edges).toContainEqual(
      expect.objectContaining({
        from: addressNodeId(REUSED_ADDR),
        to: txNodeId(ROOT),
        kind: 'input',
      }),
    );
  });

  it('un satélite sin expandir (idTx2 vacío) no inventa una arista al vacío', () => {
    const { investigation } = migrate();
    const ids = new Set(Object.keys(investigation.state.graph.nodes));

    for (const edge of Object.values(investigation.state.graph.edges)) {
      expect(ids.has(edge.from), `${edge.from} debería existir`).toBe(true);
      expect(ids.has(edge.to), `${edge.to} debería existir`).toBe(true);
    }
  });

  it('los importes se migran a bigint', () => {
    const { investigation } = migrate();
    const edge = Object.values(investigation.state.graph.edges).find(
      (e) => e.to === addressNodeId('14o7zMMUJkG6De24r3JkJ6USgChq7iWF86'),
    );

    expect(edge?.value).toBe(70_000n);
  });

  it('esUtxo se migra donde el legacy lo escribía de verdad', () => {
    const { investigation } = migrate();
    const edge = Object.values(investigation.state.graph.edges).find(
      (e) => e.to === addressNodeId('1ExDenUFY57jPrEkZjPYKjdpfRsTh1f8jJ'),
    );

    expect(edge?.isUtxo).toBe(true);
  });
});

describe('lo que se descarta, y avisa', () => {
  it('descarta sombra y rayado', () => {
    // docs/05 §3 los da por descartables y lo son: son ajustes de render del
    // motor viejo (p5), no parte de la investigación.
    const { warnings } = migrate();
    expect(warnings.join(' ')).toMatch(/sombra/i);
    expect(warnings.join(' ')).toMatch(/rayado/i);
  });

  it('descarta los nodos «Multi Txs», que nunca llegaron a existir', () => {
    // BUG-016: la rama de Multi Tx del legacy estaba a medio hacer (solo
    // console.log). Su id no es un txid, así que no hay nada que traer de la
    // cadena: se descarta y se avisa, en vez de crear un nodo fantasma.
    const { investigation, warnings } = migrate();

    const ids = Object.keys(investigation.state.graph.nodes);
    expect(ids.some((id) => id.includes('Multi'))).toBe(false);
    expect(warnings.join(' ')).toMatch(/Multi Txs/);
  });

  it('descarta las heurísticas guardadas en vez de propagar datos incorrectos', () => {
    // El fixture trae heuristic[0] = true en la raíz. NO se migra: las
    // heurísticas del legacy son las que BUG-006..009 demostraron incorrectas
    // (llevaban años dando resultados erróneos). Migrarlas sería conservar el
    // bug. Se recalculan con las de la Fase 2, que sí tienen vectores.
    const { warnings } = migrate();
    expect(warnings.join(' ')).toMatch(/heur/i);
  });

  it('descarta la geometría del render viejo (anchoTx, radioSatelites…)', () => {
    // Eran tamaños globales del dibujo, no del modelo: en v2 el tamaño del nodo
    // lo decide la hoja de estilos.
    const { warnings } = migrate();
    expect(warnings.join(' ')).toMatch(/anchoTx|geometr/i);
  });

  it('avisa de que los datos de cadena se volverán a descargar', () => {
    // El legacy NO guardaba las txs completas: solo numVin/numVout/value/fees.
    // No se puede reconstruir una NormalizedTx a partir de eso, y no se inventa:
    // los nodos migrados vienen sin `tx` y la app los rellena desde la red.
    const { investigation, warnings } = migrate();

    expect(investigation.state.graph.nodes[txNodeId(ROOT)]?.tx).toBeUndefined();
    expect(warnings.join(' ')).toMatch(/descarga|red|volver/i);
  });
});

describe('un fichero legacy roto no se traga', () => {
  const TX = '85e72c0814597ec52d2d178b7125af0e3cfa07821912ca81bf4b1fbe4b4b70f2';
  const okTx = { idTx: TX, x: 10, y: 20, tagTx: '', movido: false };

  it('posiTxs que no es un array → error', () => {
    const result = migrateLegacy({ posiTxs: 'nope', posiAddrs: [] });
    expect(result.ok).toBe(false);
  });

  it('posiAddrs que no es un array → error', () => {
    const result = migrateLegacy({ posiTxs: [], posiAddrs: 'nope' });
    expect(result.ok).toBe(false);
  });

  it('un elemento de posiTxs sin idTx → error, no un nodo sin identidad', () => {
    const result = migrateLegacy({ posiTxs: [{ x: 1, y: 2 }], posiAddrs: [] });
    expect(result.ok).toBe(false);
  });

  it('un elemento de posiTxs que no es un objeto → error', () => {
    expect(migrateLegacy({ posiTxs: ['hola'], posiAddrs: [] }).ok).toBe(false);
  });

  it('un idTx que no es un txid ni un Multi Txs → error con el valor', () => {
    const result = migrateLegacy({ posiTxs: [{ idTx: 'no-soy-un-txid' }], posiAddrs: [] });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.issues.join(' ')).toContain('no-soy-un-txid');
  });

  it('un elemento de posiAddrs que no es un objeto → error', () => {
    expect(migrateLegacy({ posiTxs: [okTx], posiAddrs: [42] }).ok).toBe(false);
  });

  it('una dirección sin idAddr → error', () => {
    expect(migrateLegacy({ posiTxs: [okTx], posiAddrs: [{ io: 'O', idTx1: TX }] }).ok).toBe(false);
  });

  it('posiciones que no son números caen a 0, no a NaN', () => {
    // Un NaN en una posición se propaga al layout y deja el nodo en el limbo:
    // Cytoscape lo coloca en (0,0) o desaparece, según el día.
    const result = migrateLegacy({
      posiTxs: [{ idTx: TX, x: 'ancho', y: null }],
      posiAddrs: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.investigation.state.graph.nodes[txNodeId(TX)]).toMatchObject({ x: 0, y: 0 });
  });

  it('una arista cuyo pivot no existe se descarta en vez de colgar', () => {
    const result = migrateLegacy({
      posiTxs: [okTx],
      posiAddrs: [{ idAddr: 'addr1', io: 'O', idTx1: 'f'.repeat(64), idTx2: '' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.investigation.state.graph.edges).toEqual({});
    expect(result.investigation.state.graph.nodes[addressNodeId('addr1')]).toBeUndefined();
  });

  it('un value ilegible cuenta como 0, no rompe la migración', () => {
    const result = migrateLegacy({
      posiTxs: [okTx],
      posiAddrs: [{ idAddr: 'addr1', io: 'O', idTx1: TX, idTx2: '', value: 'un montón' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.values(result.investigation.state.graph.edges)[0]?.value).toBe(0n);
  });

  it('un value en texto se lee bien: el legacy los guardaba de las dos formas', () => {
    const result = migrateLegacy({
      posiTxs: [okTx],
      posiAddrs: [{ idAddr: 'addr1', io: 'O', idTx1: TX, idTx2: '', value: '70000' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.values(result.investigation.state.graph.edges)[0]?.value).toBe(70_000n);
  });

  it('un bgColor que no es un color se ignora sin romper nada', () => {
    const result = migrateLegacy({
      posiTxs: [{ ...okTx, bgColor: 'azul' }],
      posiAddrs: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.investigation.state.graph.nodes[txNodeId(TX)]?.color).toBeUndefined();
  });

  it('un tagTx que no es texto no se convierte en una etiqueta rara', () => {
    const result = migrateLegacy({ posiTxs: [{ ...okTx, tagTx: 42 }], posiAddrs: [] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.investigation.state.graph.nodes[txNodeId(TX)]?.label).toBeUndefined();
  });

  it('una dirección que aparece dos veces se reutiliza, no se duplica', () => {
    // Es justo lo que hace visible el flujo de fondos: la misma dirección tocada
    // por dos txs tiene que ser UN nodo (H-07).
    const other = '993ced02486f9aaa5a5ed943141e05e436aac054dcea78a560f0f1860c80415a';
    const result = migrateLegacy({
      posiTxs: [okTx, { ...okTx, idTx: other }],
      posiAddrs: [
        { idAddr: 'addr1', io: 'O', idTx1: TX, idTx2: '', value: 1 },
        { idAddr: 'addr1', io: 'I', idTx1: other, idTx2: '', value: 2, tagAddr: 'La misma' },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const addrs = Object.values(result.investigation.state.graph.nodes).filter(
      (node) => node.kind === 'address',
    );
    expect(addrs).toHaveLength(1);
    expect(addrs[0]?.label).toBe('La misma');
  });

  it('un legacy vacío migra a una investigación vacía, sin romperse', () => {
    const result = migrateLegacy({ posiTxs: [], posiAddrs: [] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.investigation.state.graph.nodes).toEqual({});
    expect(result.investigation.rootTxid).toBeUndefined();
  });
});

describe('un fichero legacy se abre por la puerta normal (RF-21)', () => {
  it('loadInvestigation reconoce y migra el legacy sin que nadie se lo pida', () => {
    // Criterio de salida de la Fase 5: «una investigación guardada con la app
    // vieja se abre en la nueva». El usuario no sabe con qué versión guardó
    // aquello: abre su fichero y funciona.
    const result = loadInvestigation(legacyText);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.investigation.rootTxid).toBe(ROOT);
    expect(result.investigation.state.graph.nodes[txNodeId(ROOT)]?.label).toBe('Origen del robo');
  });

  it('y avisa de lo que no pudo traerse', () => {
    const result = loadInvestigation(legacyText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('un v2 no pasa por el migrador: las dos rutas no se pisan', () => {
    const v2 = saveInvestigation(migrate().investigation.state, { network: 'mainnet' });

    const result = loadInvestigation(v2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.warnings).toEqual([]);
  });
});

describe('el resultado de migrar es un v2 de verdad', () => {
  it('lo migrado pasa la validación de v2: mismo camino, mismas garantías', () => {
    // Si el migrador produjera algo que `loadInvestigation` rechaza, tendríamos
    // dos formatos v2 distintos y solo uno validado. Esto lo impide.
    const { investigation } = migrate();

    const text = saveInvestigation(investigation.state, {
      network: 'mainnet',
      ...(investigation.rootTxid === undefined ? {} : { rootTxid: investigation.rootTxid }),
    });

    expect(loadInvestigation(text).ok).toBe(true);
  });
});
