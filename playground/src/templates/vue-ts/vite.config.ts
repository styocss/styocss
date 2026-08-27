import pikacss from '@pikacss/unplugin-pikacss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    pikacss(),
    vue(),
  ],
})
