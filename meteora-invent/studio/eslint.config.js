import { FlatCompat } from '@eslint/eslintrc';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: {},
  allConfig: {},
});

export default [
  ...compat.extends(require.resolve('@meteora-invent/config-eslint/node.js')),
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      // allow process.exit() in SDK/demo scripts
      'no-process-exit': 'off',
      // allow unused variables with underscore prefix, and make others warnings
      '@typescript-eslint/no-unused-vars': 'off',
      // allow any types in SDK demo code
      '@typescript-eslint/no-explicit-any': 'off',
      // allow non-null assertions in SDK code
      '@typescript-eslint/no-non-null-assertion': 'off',
      // allow named imports as default (common in SDK usage)
      'import/no-named-as-default': 'off',
      // allow import order
      'import/order': 'off',
      // allow no-unused-vars
      'no-unused-vars': 'off',
    },
  },
  {
    ignores: ['.eslintrc.js', 'dist/**', 'node_modules/**'],
  },
];
