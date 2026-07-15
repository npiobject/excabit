/**
 * Historial de undo/redo (RF-28, ADR-004).
 *
 * **BUG-013** — lo que hacía el legacy y aquí no se repite:
 *
 * 1. `mousePressed()` llamaba a `saveState()` en **cada click**, guardando una
 *    imagen completa del canvas en un array **sin límite**. En una sesión larga
 *    la memoria crecía hasta donde diera el navegador.
 * 2. `undoToPreviousState()` solo **repintaba la imagen**: los datos (`posiTxs`…)
 *    no se revertían, así que el siguiente redibujado resucitaba el estado que
 *    supuestamente se había deshecho.
 *
 * Aquí se apilan **comandos**, no píxeles: cada uno guarda una referencia al
 * estado inmutable anterior (structural sharing, no copias), la pila tiene tope
 * y deshacer revierte los datos — de donde el render deriva solo.
 */
import type { InvestigationState, UndoableCommand } from './commands';

/** Tope de la pila (ADR-004). Acota la memoria por diseño, no por suerte. */
export const UNDO_LIMIT = 200;

export interface ExecuteOptions {
  /**
   * Fusiona este comando con el anterior si comparten clave.
   *
   * Un drag emite decenas de posiciones por segundo; sin esto, deshacer un
   * arrastre exigiría 40 Ctrl+Z y la pila se llenaría de ruido. Un drag = un
   * comando (ADR-004).
   */
  coalesceKey?: string;
}

interface Entry {
  command: UndoableCommand;
  coalesceKey: string | undefined;
}

interface RedoEntry {
  entry: Entry;
  /** Estado exacto al que vuelve el redo. */
  after: InvestigationState;
}

export class History {
  private readonly undoStack: Entry[] = [];
  private readonly redoStack: RedoEntry[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Comandos deshacibles apilados. */
  get size(): number {
    return this.undoStack.length;
  }

  /** Aplica un comando y lo apila. Cualquier comando nuevo invalida el redo. */
  execute(
    command: UndoableCommand,
    state: InvestigationState,
    options: ExecuteOptions = {},
  ): InvestigationState {
    // Rama abandonada: si el usuario deshace y luego hace otra cosa, el futuro
    // que había dejado de existir.
    this.redoStack.length = 0;

    const last = this.undoStack.at(-1);
    const key = options.coalesceKey;
    const merges = key !== undefined && last?.coalesceKey === key;

    // Al fusionar NO se apila: el comando que ya está guarda el estado previo a
    // todo el drag, que es justo al que debe volver un Ctrl+Z.
    if (!merges) {
      this.undoStack.push({ command, coalesceKey: key });
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    }

    return command.apply(state);
  }

  undo(state: InvestigationState): InvestigationState {
    const entry = this.undoStack.pop();
    if (entry === undefined) return state;

    this.redoStack.push({ entry, after: state });

    return entry.command.undo(state);
  }

  redo(state: InvestigationState): InvestigationState {
    const redo = this.redoStack.pop();
    if (redo === undefined) return state;

    this.undoStack.push(redo.entry);

    return redo.after;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
