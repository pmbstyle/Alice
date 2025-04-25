import fs from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import pkg from './package.json'

export default defineConfig(({ mode, command }) => {
  fs.rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG
  const env = loadEnv(mode, process.cwd(), '')
  const QB_BASE_URL = env.VITE_QB_URL

  return {
    plugins: [
      vue(),
      tailwindcss(),
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js',
            dest: './',
          },
          {
            src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx',
            dest: './',
          },
          {
            src: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx',
            dest: './',
          },
          {
            src: 'node_modules/onnxruntime-web/dist/*.wasm',
            dest: './',
          },
        ],
      }),
      electron({
        main: {
          entry: 'electron/main/index.ts',
          onstart({ startup }) {
            if (process.env.VSCODE_DEBUG) {
              console.log('[startup] Electron App')
            } else {
              startup()
            }
          },
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                external: Object.keys(
                  'dependencies' in pkg ? pkg.dependencies : {}
                ),
              },
            },
          },
        },
        preload: {
          input: 'electron/preload/index.ts',
          vite: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined,
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external: Object.keys(
                  'dependencies' in pkg ? pkg.dependencies : {}
                ),
              },
            },
          },
        },
        renderer: {},
      }),
    ],
    css: {
      postcss: {
        plugins: [
        ]
      }
    },
    server: (() => {
      if (process.env.VSCODE_DEBUG) {
        const url = new URL(pkg.debug.env.VITE_DEV_SERVER_URL)
        return {
          host: url.hostname,
          port: +url.port,
          proxy: {
            '/api/v2': {
              target: QB_BASE_URL,
              changeOrigin: true,
              secure: false,
            },
          },
        }
      } else {
        return {
          proxy: {
            '/api/v2': {
              target: QB_BASE_URL,
              changeOrigin: true,
              secure: false,
            },
          },
        }
      }
    })(),
    clearScreen: false,
    define: {
      global: {},
      __APP_MODE__: JSON.stringify(process.env.ELECTRON ? 'electron' : 'web'),
    },
  }
})
