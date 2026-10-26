import { defineConfig } from 'vitest/config'

// Nested Claude worktrees have their own sources and dependencies; never collect their tests here.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } })
