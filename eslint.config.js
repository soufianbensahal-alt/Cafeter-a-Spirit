import js from '@eslint/js';
import globals from 'globals';

const sharedRules = {
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-constant-condition': ['error', { checkLoops: false }]
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'supabase/.branches/**']
  },
  {
    files: ['*.js', 'client/**/*.js', 'business/**/*.js', 'data/**/*.js', 'services/**/*.js', 'startup.js', 'bootstrap.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        __SUPABASE_URL__: 'readonly',
        __SUPABASE_PUBLISHABLE_KEY__: 'readonly'
      }
    },
    rules: sharedRules
  },
  {
    files: ['sw.js'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 'latest', globals: globals.serviceworker },
    rules: sharedRules
  },
  {
    files: ['scripts/**/*.mjs', 'test/**/*.js', 'tests/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node
    },
    rules: sharedRules
  }
];
