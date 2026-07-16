import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts', 'tests/integration/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // `persistence/` entra en el gate desde la Fase 5: es dominio puro (no
      // toca DOM ni Cytoscape, docs/05 §2) y guarda el trabajo del usuario —
      // un fallo aquí no se ve hasta que alguien no puede abrir su fichero.
      include: ['src/core/**', 'src/data/**', 'src/analysis/**', 'src/persistence/**'],
      // Gates del roadmap (docs/07 §1): core/+data/ ≥ 90 %, analysis/ ≥ 95 %.
      // analysis/ va más alto porque ahí vivían los bugs silenciosos del
      // legacy: las heurísticas dieron resultados incorrectos durante años
      // (BUG-006..009) sin que nadie lo notara.
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
        'src/analysis/**': {
          lines: 95,
          functions: 95,
          branches: 95,
          statements: 95,
        },
      },
    },
  },
});
