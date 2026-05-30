import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { aiAssistPlugin } from './server/aiAssistPlugin'
import { assetStoragePlugin } from './server/assetStoragePlugin'
import { exportPlugin } from './server/exportPlugin'
import { libraryStoragePlugin } from './server/libraryStoragePlugin'
import { projectStoragePlugin } from './server/projectStoragePlugin'

export default defineConfig({
  plugins: [react(), tailwindcss(), aiAssistPlugin(), projectStoragePlugin(), assetStoragePlugin(), libraryStoragePlugin(), exportPlugin()],
  server: {
    port: 3000,
  }
})
