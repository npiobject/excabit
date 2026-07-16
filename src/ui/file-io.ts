/**
 * Traer y llevar ficheros del disco (RF-21/23/24).
 *
 * Vive en `ui/` porque es DOM puro: `persistence/` genera el contenido y no sabe
 * —ni tiene por qué— que existe un `<a download>` (docs/05 §2).
 */

/** Descarga un texto como fichero. */
export function downloadText(filename: string, mime: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));

  try {
    triggerDownload(filename, url);
  } finally {
    // Sin esto, el Blob se queda en memoria hasta que se recargue la página.
    // Un `revoke` inmediato aborta la descarga en algún navegador, de ahí el
    // aplazamiento a la siguiente vuelta del bucle de eventos.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }
}

/** Descarga una data URL (el PNG que produce el motor). */
export function downloadDataUrl(filename: string, dataUrl: string): void {
  triggerDownload(filename, dataUrl);
}

function triggerDownload(filename: string, url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  // Firefox exige que el enlace esté en el documento para que el click cuente.
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * Abre el selector de ficheros y devuelve el texto elegido.
 *
 * `null` = no eligió nada. No se distingue «canceló» de «cerró el diálogo»
 * porque el navegador tampoco lo dice: en ambos casos no hay nada que cargar.
 */
export function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.append(input);

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();

      if (file === undefined) {
        resolve(null);
        return;
      }

      file
        .text()
        .then((text) => {
          resolve({ name: file.name, text });
        })
        .catch(() => {
          resolve(null);
        });
    });

    // Si el usuario cancela, `change` no llega nunca y la promesa se quedaría
    // colgada con el `<input>` dentro del DOM. `cancel` sí llega.
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });

    input.click();
  });
}

/** Nombre de fichero con fecha, estable y ordenable: `excabit-2026-07-16.json`. */
export function timestampedName(prefix: string, extension: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  return `${prefix}-${stamp}.${extension}`;
}
