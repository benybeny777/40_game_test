import js from '@eslint/js'
import ts from 'typescript-eslint'

export default ts.config(
  { ignores: ['out/**', 'node_modules/**', '.dev-data/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['tools/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly' } } },
  { files: ['tools/*.cjs'], languageOptions: { globals: { require: 'readonly', __dirname: 'readonly', process: 'readonly', console: 'readonly', setTimeout: 'readonly' } }, rules: { '@typescript-eslint/no-require-imports': 'off' } },
  { files: ['src/core/**/*.ts'], rules: {
    'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use sim/rng.ts' }, { object: 'Date', property: 'now', message: 'Use world.tick' }],
    'no-restricted-globals': ['error', { name: 'Date', message: 'Use world.tick' }],
    'no-restricted-imports': ['error', { patterns: ['node:*', 'electron', 'electron/*'] }],
  } },
  { files: ['src/core/sim/**/*.ts'], rules: {
    'no-magic-numbers': ['error', { ignore: [0, 1, 1000], ignoreArrayIndexes: true }],
  } },
)
