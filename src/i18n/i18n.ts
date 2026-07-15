/**
 * i18n (RF-30, docs/00: bilingüe desde el primer día).
 *
 * El código y los identificadores van en inglés; la UI, en el idioma del
 * usuario. El legacy mezclaba español dentro del código (`posiTxs`,
 * `salidaMontoMayor`), que es justo lo que esta separación evita.
 *
 * Sin librería: son dos diccionarios planos y una interpolación. Meter una
 * dependencia de i18n aquí sería pagar peso y API por algo que cabe en 40
 * líneas (misma lógica que la ADR-003).
 */
import es from './es.json';
import en from './en.json';

export type Locale = 'es' | 'en';

/** Las claves salen del diccionario español: es la referencia. */
export type MessageKey = keyof typeof es;

const DICTIONARIES: Record<Locale, Record<string, string>> = { es, en };

const STORAGE_KEY = 'excabit.locale';
const DEFAULT_LOCALE: Locale = 'es';

const isLocale = (value: string | null): value is Locale => value === 'es' || value === 'en';

/** Idioma guardado > idioma del navegador > español. */
export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // localStorage puede estar bloqueado (modo privado, iframe): no es motivo
    // para no arrancar.
  }

  return navigator.language.startsWith('en') ? 'en' : DEFAULT_LOCALE;
}

let current: Locale = DEFAULT_LOCALE;

export function setLocale(locale: Locale): void {
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ídem: no poder recordar el idioma no debe romper el cambio de idioma.
  }
  document.documentElement.lang = locale;
}

export const getLocale = (): Locale => current;

/**
 * Traduce. Si falta la clave devuelve la propia clave: en un fallo de
 * traducción es mejor ver `panel.details` en la UI que una cadena vacía —
 * se ve, se reporta y se arregla.
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const message = DICTIONARIES[current][key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
  if (params === undefined) return message;

  return message.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];

    return value === undefined ? match : String(value);
  });
}

/** Traduce todos los `[data-i18n]` del documento (se llama al cambiar idioma). */
export function translateDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset['i18n'];
    if (key !== undefined) element.textContent = t(key as MessageKey);
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((element) => {
    // Formato: "placeholder:search.placeholder,title:action.search"
    const spec = element.dataset['i18nAttr'];
    if (spec === undefined) return;

    for (const pair of spec.split(',')) {
      const [attribute, key] = pair.split(':');
      if (attribute !== undefined && key !== undefined) {
        element.setAttribute(attribute, t(key as MessageKey));
      }
    }
  });
}
