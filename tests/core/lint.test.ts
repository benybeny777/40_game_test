import { ESLint } from 'eslint'
import { expect, it } from 'vitest'
it('coreのMath.randomとDate、およびNode入出力をESLintが拒否する', async () => {
  const engine = new ESLint()
  const [result] = await engine.lintText("import fs from 'node:fs';\nconsole.log(Math.random(), Date.now(), new Date(), fs);", { filePath: 'src/core/forbidden.ts' })
  const rules = result.messages.map((message) => message.ruleId)
  expect(rules).toContain('no-restricted-properties')
  expect(rules).toContain('no-restricted-globals')
  expect(rules).toContain('no-restricted-imports')
})
