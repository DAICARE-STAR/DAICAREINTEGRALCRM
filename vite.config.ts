import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { esClaveSecreta } from './src/lib/clave-supabase'

// Modelo: team-portal/vite.config.ts (hash en docs/origen.md). Cambios del
// producto: nombre del portal por VITE_PORTAL_NOMBRE (título, manifest),
// font-src e img-src con el origen exacto de Supabase, sin iframes.

// Origen exacto del proyecto de Supabase (https y wss) para connect-src:
// con *.supabase.co un XSS podría exfiltrar a un proyecto de un tercero.
// Sin VITE_SUPABASE_URL (la CI no tiene .env) se usa el mismo marcador con
// el que el cliente de Supabase arranca, así que nunca queda abierto.
const MARCADOR_SUPABASE = 'https://placeholder.supabase.co'
const NOMBRE_POR_DEFECTO = 'Bash Logistics'

// Piso de navegadores: el valor por defecto de Vite 8 (Safari 16.4 / Chrome 111)
// reescribe las media queries en sintaxis de rango y un iPhone con iOS < 16.4
// perdería el diseño móvil.
const BASE_NAVEGADORES = ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14']

function origenesSupabase(valor: string | undefined): [string, string] {
  let url: URL
  try {
    url = new URL(valor || MARCADOR_SUPABASE)
  } catch {
    console.warn(`[csp] VITE_SUPABASE_URL no es una URL válida; se usa ${MARCADOR_SUPABASE}`)
    url = new URL(MARCADOR_SUPABASE)
  }
  const ws = url.protocol === 'http:' ? 'ws:' : 'wss:'
  return [url.origin, `${ws}//${url.host}`]
}

// CSP estricta del shell. Va como <meta> solo en el build: en dev bloquearía
// el script inline de React Fast Refresh. frame-ancestors no funciona en meta:
// viaja como cabecera en netlify.toml. font-src admite el origen de Supabase
// porque una instalación puede alojar sus fuentes en el bucket «marca».
function cspDelShell(supabaseUrl: string | undefined): string {
  const [https, wss] = origenesSupabase(supabaseUrl)
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${https}`,
    `font-src 'self' data: ${https}`,
    `connect-src 'self' ${https} ${wss}`,
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

const escaparHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

// Iconos neutros de public/brand (PP-PWA), escritos en el manifest del build
const ICONOS_MANIFEST = [
  { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/brand/imagotipo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]

function manifest(nombre: string): string {
  return JSON.stringify(
    { name: nombre, short_name: nombre, start_url: '/', scope: '/', display: 'standalone', lang: 'es', icons: ICONOS_MANIFEST },
    null,
    2
  )
}

// Nombre del portal en el HTML (%PORTAL_NOMBRE%), manifest con ese nombre y
// CSP del shell en el build.
function portal(nombre: string, csp: string): Plugin {
  return {
    name: 'portal-nombre-manifest-csp',
    transformIndexHtml(html, ctx) {
      let salida = html.split('%PORTAL_NOMBRE%').join(escaparHtml(nombre))
      if (!ctx.server) {
        salida = salida.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`
        )
      }
      return salida
    },
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(manifest(nombre))
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest(nombre) })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Mismas fuentes que import.meta.env: archivos .env y variables VITE_* del
  // entorno (Netlify las define en el panel)
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const nombre = env.VITE_PORTAL_NOMBRE?.trim() || NOMBRE_POR_DEFECTO
  // Fallar cerrado: una clave secreta en la variable pública no llega al
  // bundle. Se vacía antes de que Vite lea el entorno y además se fija con
  // define, y la app arranca con el aviso de configuración pendiente.
  const claveSecreta = esClaveSecreta(env.VITE_SUPABASE_ANON_KEY)
  if (claveSecreta) {
    process.env.VITE_SUPABASE_ANON_KEY = ''
    console.error('[seguridad] VITE_SUPABASE_ANON_KEY contiene una clave SECRETA de Supabase. Se descarta del build: pon ahí la clave pública (publishable o anon) y rota la secreta, que ya estuvo expuesta.')
  }
  return {
    define: {
      __CLAVE_SECRETA_DESCARTADA__: JSON.stringify(claveSecreta),
      ...(claveSecreta ? { 'import.meta.env.VITE_SUPABASE_ANON_KEY': '""' } : {}),
    },
    plugins: [react(), portal(nombre, cspDelShell(env.VITE_SUPABASE_URL))],
    server: { port: 5190, strictPort: true },
    preview: { port: 4190, strictPort: true },
    build: {
      target: BASE_NAVEGADORES,
      cssTarget: BASE_NAVEGADORES,
      // 404.html es una página estática propia (sin scripts) que Netlify sirve
      // con 404 forzado en las rutas internas
      rollupOptions: { input: { index: 'index.html', 404: '404.html' } },
    },
  }
})
