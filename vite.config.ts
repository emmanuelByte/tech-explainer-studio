import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { assetStoragePlugin } from './server/assetStoragePlugin'
import { exportPlugin } from './server/exportPlugin'
import { libraryStoragePlugin } from './server/libraryStoragePlugin'
import { localTtsPlugin } from './server/localTtsPlugin'
import { reviewPlugin } from './server/reviewPlugin'
import { projectStoragePlugin } from './server/projectStoragePlugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), projectStoragePlugin(), assetStoragePlugin(), libraryStoragePlugin(), localTtsPlugin(), exportPlugin(), reviewPlugin()],
  server: {
    port: 3000,
  }
})
