import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: './',           // frontend folder is root
  build: {
    outDir: '../static', // output bundle goes to Flask static
    emptyOutDir: false,  // keep your other static files
    rollupOptions: {
      input: path.resolve(__dirname, 'main.js') // entry point
    }
  }
})