import { defineConfig } from 'vitest/config'

// Nested Claude worktrees have their own sources and dependencies; never collect their tests here.
// Bound worker startup contention while the local renderer/build is also running.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], maxWorkers: 4 } })
