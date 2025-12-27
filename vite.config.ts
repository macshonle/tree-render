import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import treeExamples from './vite-plugin-tree-examples'

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    treeExamples(),
  ],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  clearScreen: false
})
