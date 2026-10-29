import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/*.test.ts', 'test-bench/test/**/*.test.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [
        {
          browser: 'chromium',
          launch: {
            channel: 'chrome',
          },
        },
      ],
    },
  },
})
