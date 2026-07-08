import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  root: 'nlpui',
  base: './',

  publicDir: path.resolve(__dirname, 'nlpui/public'),

  build: {
    outDir: path.resolve(__dirname, 'static/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'nlpui/index.html'),
    },
    cssMinify: false,
    minify: 'terser',
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'nlpui/src'),
    },
  },

  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.[tj]sx?$/,
    exclude: [],
  },

  css: {
    postcss: null,
  },

  server: {
    proxy: {
      '/classes':          'http://localhost:5056',
      '/class_details':    'http://localhost:5056',
      '/property_details': 'http://localhost:5056',
      '/object_properties':'http://localhost:5056',
      '/data_properties':  'http://localhost:5056',
      '/ontology_search':  'http://localhost:5056',
      '/validate_property':'http://localhost:5056',
      '/framework':        'http://localhost:5056',
      '/upload_document':  'http://localhost:5056',
      '/export_trig':      'http://localhost:5056',
      '/export_nif':       'http://localhost:5056',
      '/export_ttl':       'http://localhost:5056',
      '/generate_mermaid': 'http://localhost:5056',
      '/run_reasoner':     'http://localhost:5056',
    },
  },
})
