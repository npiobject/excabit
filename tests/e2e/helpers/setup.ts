import type { Page } from '@playwright/test';

/**
 * Salta el tour de primer uso (RF-32).
 *
 * Cada test de Playwright arranca con `localStorage` vacío, así que la app cree
 * que es la primera vez SIEMPRE y abre el tour, cuyo overlay modal intercepta
 * cualquier click. Los tests que no van del tour lo marcan como visto antes de
 * cargar la página; `tour.spec.ts` es el único que no llama a esto, porque su
 * trabajo es justo comprobar que aparece.
 */
export async function skipTour(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('excabit.tourSeen', '1');
  });
}

/** Fija el idioma para que los tests no dependan del navegador que los corre. */
export async function useLocale(page: Page, locale: 'es' | 'en'): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem('excabit.locale', value);
  }, locale);
}
