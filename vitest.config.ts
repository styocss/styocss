import { defineConfig } from 'vitest/config'
import { alias } from './alias'

export default defineConfig({
  resolve: {
    alias,
  },
})
