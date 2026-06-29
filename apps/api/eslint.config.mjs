import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// ponytail: recommended (non-type-checked) ruleset; noisy stylistic rules → warn so
// lint stays green on generated/decorator-heavy Nest code without churn.
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { sourceType: 'module' },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    // Test files legitimately use CJS interop (supertest, cookie-parser) via `import = require`.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
