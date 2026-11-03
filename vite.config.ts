import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative asset URLs — required so the production build works over file:// in
// the Electron shell as well as over HTTPS on Vercel.
export default defineConfig({
  base: './',
  plugins: [react()],
})
