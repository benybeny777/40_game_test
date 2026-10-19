import js from '@eslint/js'
import ts from 'typescript-eslint'

export default ts.config(
  { ignores: ['out/**', 'node_modules/**', '.dev-data/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['tools/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly' } } },
)
