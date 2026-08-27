import pikacss from '@pikacss/unplugin-pikacss/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [
    pikacss(),
    solid(),
  ],
})
