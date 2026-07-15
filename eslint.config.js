import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Capas según docs/05-especificacion-tecnica.md §2.
 * Regla arquitectónica: core/, data/, analysis/ y persistence/ no conocen
 * Cytoscape ni el DOM — de ahí que sean testeables en Node sin navegador.
 */
const DOMAIN_LAYERS = ['src/core/**', 'src/data/**', 'src/analysis/**', 'src/persistence/**'];

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'old/**', 'mocks/**'] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `_` marca lo intencionadamente sin usar. Sobre todo para quitar una
      // propiedad con rest: `({ label: _drop, ...node }) => node`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // --- Fronteras entre capas ---
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // Sin resolver de TS, boundaries no resuelve los imports y la regla
      // pasa en vacío: clasifica el destino como desconocido y no opina.
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/include': ['src/**/*.ts'],
      'boundaries/elements': [
        { type: 'core', pattern: 'src/core' },
        { type: 'data', pattern: 'src/data' },
        { type: 'analysis', pattern: 'src/analysis' },
        { type: 'persistence', pattern: 'src/persistence' },
        { type: 'graph', pattern: 'src/graph' },
        { type: 'ui', pattern: 'src/ui' },
        { type: 'i18n', pattern: 'src/i18n' },
        // main.ts queda deliberadamente sin clasificar: es el wiring y puede
        // importar cualquier capa (docs/05 §2).
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            { from: { element: { types: 'core' } }, allow: { to: { element: { types: 'core' } } } },
            {
              from: { element: { types: 'data' } },
              allow: { to: { element: { types: { anyOf: ['core', 'data'] } } } },
            },
            {
              from: { element: { types: 'analysis' } },
              allow: { to: { element: { types: { anyOf: ['core', 'analysis'] } } } },
            },
            {
              from: { element: { types: 'persistence' } },
              allow: { to: { element: { types: { anyOf: ['core', 'persistence'] } } } },
            },
            {
              from: { element: { types: 'graph' } },
              allow: { to: { element: { types: { anyOf: ['core', 'graph', 'i18n'] } } } },
            },
            {
              from: { element: { types: 'ui' } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ['core', 'data', 'analysis', 'persistence', 'graph', 'i18n', 'ui'],
                    },
                  },
                },
              },
            },
            { from: { element: { types: 'i18n' } }, allow: { to: { element: { types: 'i18n' } } } },
          ],
        },
      ],
    },
  },

  // --- El dominio ignora que existan Cytoscape y el navegador ---
  {
    files: DOMAIN_LAYERS,
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'cytoscape',
              message:
                'ADR-001: Cytoscape solo se toca en graph/cy-adapter.ts. El dominio es agnóstico del render.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'localStorage', 'alert', 'navigator'].map((name) => ({
          name,
          message:
            'El dominio no importa DOM (docs/05 §2). Los estados de carga viven en el store; los errores son toasts en ui/.',
        })),
      ],
    },
  },

  // --- Tests ---
  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  { files: ['*.config.ts'], languageOptions: { globals: { ...globals.node } } },

  // La config de ESLint no la cubre el tsconfig del proyecto: sin reglas con tipos.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },

  prettier,
);
