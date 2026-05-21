/**
 * ESLint flat config for tradingview-mcp.
 *
 * Goal: catch obviously-broken code (ReferenceError, unused vars without
 * underscore prefix, undefined globals) without imposing a style regime that
 * fights the existing codebase. Tightening is opt-in per-rule once baseline
 * is clean.
 */
import globals from 'globals';

export default [
  {
    files: ['src/**/*.js', 'scripts/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
        fetch: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^(_|e$)',
      }],
      'no-redeclare': 'error',
      'no-self-assign': 'error',
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'screenshots/**', '*.config.js'],
  },
];
