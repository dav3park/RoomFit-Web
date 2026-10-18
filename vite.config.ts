import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { furnitureModelAssets } from './scripts/furnitureModelAssets.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [furnitureModelAssets(), react(), tailwindcss()],
  worker: { plugins: () => [furnitureModelAssets()] },
})
