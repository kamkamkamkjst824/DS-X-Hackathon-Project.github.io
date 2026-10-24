import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig(() => {
  return {
    plugins: [vue()],
    server: {
      port: 5173,
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.js'],
    },
  }
})
