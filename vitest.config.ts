import { defineConfig } from 'vitest/config'

if (typeof process !== 'undefined') {
  process.env.ROLLUP_SKIP_NODEJS_REQUIRE = '1'
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    pool: 'threads',
  },
})
