import pikacss from '@pikacss/unplugin-pikacss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    pikacss(),
    react(),
  ],
})
