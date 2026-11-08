#!/usr/bin/env node
// Commit de origen (N-1): copia única del núcleo de team-portal, neutralizada
// y renombrada. Se corrió una sola vez para el paso 0.1.19 y queda versionado
// como constancia: no se vuelve a correr (los portes de módulo se hacen a mano
// y se anotan en docs/origen.md).
//
// Lee team-portal en solo lectura con `git show <hash>:<ruta>` (nunca su .env
// ni su árbol de trabajo), aplica tools/origen/mapa-renombre.json y la lista
// de textos de abajo, escribe cada archivo en este repo y genera los logos
// neutros de public/brand. Falla cerrado: un token --ld-* o --gold* sin
// destino en el mapa, una clave ld_* desconocida o un texto de la marca que
// quede tras el reemplazo detienen la corrida con salida 1 y la lista.
//
// Uso: node tools/origen/renombrar.mjs [--origen <ruta de team-portal>]
//
// Las adaptaciones que no son renombre (rutas de núcleo en App.tsx, pestañas
// de Administración, widgets de módulo fuera del Inicio, API de tema del
// producto) se hicieron a mano después, en el mismo commit; docs/origen.md
// las lista.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
const args = process.argv.slice(2)
const ORIGEN = args[args.indexOf('--origen') + 1] && args.includes('--origen')
  ? args[args.indexOf('--origen') + 1]
  : 'C:/Users/enzov/IA/luce-design/team-portal'

// Hash de team-portal (main) leído. Los archivos que cambiaron entre
// H_PERFILES y H son los de los perfiles ampliados (1.12.21 y 1.12.22), que
// no entran en el origen: llegan después como porte. Se toman en H_PERFILES.
export const H = '9d1524b'
export const H_PERFILES = '5710280'

export const ARCHIVOS = [
  'src/App.tsx',
  'src/main.tsx',
  'src/types.ts',
  'src/styles.css',
  'src/context/AuthContext.tsx',
  'src/context/CabeceraContext.tsx',
  'src/context/NotificationsContext.tsx',
  'src/context/PresenceContext.tsx',
  'src/components/AppIcon.tsx',
  'src/components/Avatar.tsx',
  'src/components/BackToTop.tsx',
  'src/components/CabeceraMarco.tsx',
  'src/components/CabeceraPagina.tsx',
  'src/components/CommandPalette.tsx',
  'src/components/Dialogo.tsx',
  'src/components/EditProfileModal.tsx',
  'src/components/IconosNav.tsx',
  'src/components/InfoI.tsx',
  'src/components/Layout.tsx',
  'src/components/LogoLoader.tsx',
  'src/components/MfaGate.tsx',
  'src/components/MfaModal.tsx',
  'src/components/NotifBell.tsx',
  'src/components/NotifSections.tsx',
  'src/components/PasswordModal.tsx',
  'src/components/Pestanas.tsx',
  'src/components/ProfileCard.tsx',
  'src/components/ProtectedRoute.tsx',
  'src/components/RightRail.tsx',
  'src/components/Skeleton.tsx',
  'src/components/UsoLatido.tsx',
  'src/components/WidgetBoundary.tsx',
  'src/components/WidgetCard.tsx',
  'src/components/WorldClockWidget.tsx',
  'src/lib/audit.ts',
  'src/lib/cabeceraMarco.ts',
  'src/lib/calendar.ts',
  'src/lib/data.ts',
  'src/lib/enlaces.ts',
  'src/lib/fechas.ts',
  'src/lib/funciones.ts',
  'src/lib/iconos-apps.ts',
  'src/lib/moneda.ts',
  'src/lib/scrollfx.ts',
  'src/lib/search.ts',
  'src/lib/supabase.ts',
  'src/lib/team.ts',
  'src/lib/teclado.ts',
  'src/lib/useArrastreWidgets.ts',
  'src/lib/useDialogo.ts',
  'src/lib/useEsMovil.ts',
  'src/lib/usePush.ts',
  'src/lib/useTitulo.ts',
  'src/lib/useWidgetData.ts',
  'src/lib/uso.ts',
  'src/lib/widgets.ts',
  'src/lib/widgetsPrefs.ts',
  'src/pages/Admin.tsx',
  'src/pages/Dashboard.tsx',
  'src/pages/Login.tsx',
  'src/pages/Team.tsx',
  'src/pages/Tools.tsx',
  'src/pages/admin/AuditTab.tsx',
  'src/pages/admin/CabeceraAdmin.tsx',
  'src/pages/admin/ConnectorsTab.tsx',
  'src/pages/admin/MembersTab.tsx',
  'src/pages/admin/NovedadesTab.tsx',
  'src/pages/admin/RolesField.tsx',
  'src/pages/admin/RolesTab.tsx',
  'src/pages/admin/UsoTab.tsx',
  'src/pages/admin/WidgetsTab.tsx',
  'src/lib/__tests__/cabeceraMarco.test.ts',
  'src/lib/__tests__/cabeceras.test.ts',
  'src/lib/__tests__/calendar.test.ts',
  'src/lib/__tests__/enlaces.test.ts',
  'src/lib/__tests__/fechas.test.ts',
  'src/lib/__tests__/funciones.test.ts',
  'src/lib/__tests__/iconos-apps.test.ts',
  'src/lib/__tests__/moneda.test.ts',
  'src/lib/__tests__/search.test.ts',
  'src/lib/__tests__/teclado.test.ts',
  'src/lib/__tests__/useArrastreWidgets.test.ts',
  'src/lib/__tests__/useWidgetData.test.ts',
  'src/lib/__tests__/uso.test.ts',
  'src/lib/__tests__/widgetsPrefs.test.ts',
  'netlify/lib/autorizacion.mts',
  'netlify/lib/email.mts',
  'netlify/lib/errores.mts',
  'netlify/lib/estados.mts',
  'netlify/lib/gemini.mts',
  'netlify/lib/ia.mts',
  'netlify/lib/ia-modelos.mts',
  'netlify/lib/ia-prompts.mts',
  'netlify/lib/ics.mts',
  'netlify/lib/push.mts',
  'netlify/lib/__tests__/autorizacion.test.ts',
  'netlify/lib/__tests__/email.test.ts',
  'netlify/lib/__tests__/errores.test.ts',
  'netlify/lib/__tests__/estados.test.ts',
  'netlify/lib/__tests__/ia.test.ts',
  'netlify/lib/__tests__/ia-modelos.test.ts',
  'netlify/lib/__tests__/ia-prompts.test.ts',
  'netlify/lib/__tests__/push.test.ts',
  'netlify/functions/check-event-reminders.mts',
  'netlify/functions/notify-event.mts',
  'netlify/functions/push-notify.mts',
  'netlify/functions/revision-seguridad.mts',
  'netlify/functions/uso-purga.mts',
  'netlify/functions/__tests__/correos.test.ts',
  'netlify/functions/__tests__/vigia.test.ts',
  'tools/seguridad/generar-contrasena.ps1',
  'tools/seguridad/pruebas-autorizacion.mjs',
  'tools/seguridad/sesion.mjs',
  'tools/seguridad/__tests__/pruebas-autorizacion.test.mjs',
  'public/apps/shared/base.css',
  'public/push-sw.js',
]

// Destino distinto de la ruta de origen: la hoja base compartida de las apps
// se funde en la del shell (las apps estáticas no viajan).
const DESTINO = { 'public/apps/shared/base.css': 'src/estilos/base-shell.css' }

// Textos de la marca, en orden (los más largos primero). Las cadenas de
// interfaz pasan a «Portal del equipo»; el nombre de la instalación
// (VITE_PORTAL_NOMBRE) se cablea a mano donde se muestra.
export const TEXTOS = [
  ['Luce Design · Portal del Equipo', 'Portal del equipo'],
  ['Portal Luce Design', 'Portal del equipo'],
  ['Team Portal — Luce Design', 'Portal del equipo'],
  ['Luce Design — Team Portal', 'Portal del equipo'],
  ['del Team Portal de Luce Design', 'del portal del equipo'],
  ['PRODID:-//Luce Design//Team Portal//ES', 'PRODID:-//Portal del equipo//ES'],
  ['@team-portal.lucedesign', '@portal.invalid'],
  ['https://ldteamportal.netlify.app', 'http://localhost:5190'],
  ['ldteamportal.netlify.app', 'localhost:5190'],
  ['lucedesign.lighting', 'empresa.test'],
  ['LuceDesign.Lighting', 'Empresa.Test'],
  ['lucedesign', 'empresa'],
  ['LuceDesign', 'Empresa'],
  ['zkddstmhiarougxhnelq', 'placeholder'],
  ['luce-bot', 'bot'],
  ['Luce Bot', 'Bot de prueba'],
  ['equipo comercial de Luce Design (iluminación arquitectónica)', 'equipo comercial de la empresa'],
  ['«Equipo Luce Design»', '«Equipo»'],
  ['«Equipo Luce\nDesign»', '«Equipo»'],
  ['LUCE DESIGN', 'PORTAL DEL EQUIPO'],
  ['de Luce Design', 'de la empresa'],
  ['— Luce Design', '— Portal del equipo'],
  ['«Luce Design · Iconos de navegación»', '«Iconos de navegación»'],
  ['Luce Design', 'Portal del equipo'],
  ['Portal del Equipo', 'Portal del equipo'],
  ['Portal LD', 'Portal del equipo'],
]

// Colores de la paleta de team-portal escritos a mano (correos, colores de
// evento): pasan a la primitiva neutra equivalente de src/estilos/paleta.css.
export const COLORES = {
  '#1b1914': '#171512', // negro cálido → base-900
  '#d4af37': '#7CC3DC', // dorado → acento-300 (sobre oscuro, y fondo de botón con texto oscuro)
  '#e8e4d8': '#E4E1DB', // → base-200
  '#f5f3ec': '#F2F0EC', // → base-100
  '#7a7462': '#625C52', // → base-500
  '#a39d8c': '#AAA49A', // → base-300
  '#5c5747': '#38342D', // → base-700
  '#857f72': '#817B6F', // → base-400
  '#f7f5f0': '#FAF9F7', // marfil → base-50
  '#7a6015': '#1D6B86', // dorado oscuro → acento-500
}

// Lo que no puede quedar en ningún archivo copiado (igual que neutralidad.test.ts)
export const PROHIBIDO = /luce|ldteamportal|zkddstmhiarougxhnelq|--ld-|'ld_|"ld_|`ld_|marfil/i

const MAPA = JSON.parse(readFileSync(join(RAIZ, 'tools/origen/mapa-renombre.json'), 'utf8'))
const TEMAS = MAPA.temas
const CLAVES = { ...MAPA.localStorage, ...MAPA.claves }
const GLOBALES = MAPA.globales

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function renombrar(texto, ruta, faltas) {
  let t = texto
  // Un token conocido va por el mapa; un prefijo de familia en un comentario o
  // una expresión regular (--ld-*, --ld-(texto|…), --ld-texto-[a-z]) pasa a --pal-
  t = t.replace(/--ld-[a-z0-9-]*[a-z0-9]/g, (m, i, s) =>
    MAPA.primitivas[m] ?? (/[-[(*]/.test(s[i + m.length] ?? '') ? m.replace('--ld-', '--pal-') : (faltas.push(`${ruta}: ${m}`), m))
  )
  t = t.replace(/--ld-(?=[*([])/g, '--pal-')
  t = t.replace(/--gold(?:-[a-z]+)*(?![a-z0-9-])/g, (m) => MAPA.semanticos[m] ?? (faltas.push(`${ruta}: ${m}`), m))
  for (const [o, d] of Object.entries(TEMAS)) {
    t = t.replace(new RegExp(`(['"])${o}\\1`, 'g'), `$1${d}$1`)
  }
  t = t.replace(/\bmarfil\b/g, 'claro').replace(/\bMarfil\b/g, 'Claro')
  t = t.replace(/\bhueso\b/g, 'calido').replace(/\bHueso\b/g, 'Cálido')
  t = t.replace(/\bld_[a-z0-9_]+/g, (m) => CLAVES[m] ?? (faltas.push(`${ruta}: ${m}`), m))
  for (const [o, d] of Object.entries(GLOBALES)) t = t.replace(new RegExp(`\\b${o}\\b`, 'g'), d)
  for (const [o, d] of Object.entries(COLORES)) t = t.replace(new RegExp(escRe(o), 'gi'), d)
  for (const [o, d] of TEXTOS) t = t.split(o).join(d)
  return t
}

function gitShow(hash, ruta) {
  return execFileSync('git', ['-C', ORIGEN, 'show', `${hash}:${ruta}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function cambio(ruta) {
  try {
    execFileSync('git', ['-C', ORIGEN, 'diff', '--quiet', H_PERFILES, H, '--', ruta])
    return false
  } catch {
    return true
  }
}

// --- Logos neutros (PP-PWA): un cuadrado redondeado en acento con un cuadro
// claro dentro, sin texto ni forma de la marca de origen. Mismos nombres de
// archivo que team-portal; PNG RGBA escrito sin dependencias.

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (b) => {
  let c = 0xffffffff
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function trozo(tipo, datos) {
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(datos.length)
  const td = Buffer.concat([Buffer.from(tipo, 'ascii'), datos])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([largo, td, crc])
}
function png(ancho, alto, pixel) {
  const filas = Buffer.alloc((ancho * 4 + 1) * alto)
  for (let y = 0; y < alto; y++) {
    const o = y * (ancho * 4 + 1)
    for (let x = 0; x < ancho; x++) filas.set(pixel(x, y), o + 1 + x * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(filas, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ])
}
const ACENTO = [0x1d, 0x6b, 0x86, 255]
const CLARO = [0xfa, 0xf9, 0xf7, 255]
const NADA = [0, 0, 0, 0]
// Marca: cuadrado de lado l en (x0, y0), radio 22 %, con un cuadro claro al 40 %
function marca(x0, y0, l, fondo) {
  const r = l * 0.22
  return (x, y) => {
    const u = x - x0
    const v = y - y0
    if (u < 0 || v < 0 || u >= l || v >= l) return fondo
    const cx = Math.min(Math.max(u, r), l - r)
    const cy = Math.min(Math.max(v, r), l - r)
    if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return fondo
    const a = l * 0.3
    return u >= a && u < l - a && v >= a && v < l - a ? CLARO : ACENTO
  }
}
export const LOGOS = {
  'favicon-64.png': [64, 64],
  'icon-192.png': [192, 192],
  'icon-maskable-512.png': [512, 512, 'lleno'],
  'imagotipo-512.png': [512, 512],
  'logo-banner-transp-440.png': [440, 220],
  'logo-banner-transp.png': [880, 440],
  'logo-icon.png': [612, 612],
  'logotipo-cuadrado.png': [1000, 1000, 'lleno'],
}
function logo(ancho, alto, modo) {
  if (modo === 'lleno') {
    // Fondo pleno (maskable): la marca en la zona segura del 60 %
    const l = Math.round(ancho * 0.6)
    const m = marca((ancho - l) / 2, (alto - l) / 2, l, CLARO)
    return png(ancho, alto, m)
  }
  const l = Math.round(Math.min(ancho, alto) * 0.9)
  return png(ancho, alto, marca((ancho - l) / 2, (alto - l) / 2, l, NADA))
}

function main() {
  const faltas = []
  const restos = []
  const enPerfiles = []
  for (const ruta of ARCHIVOS) {
    const hash = cambio(ruta) ? H_PERFILES : H
    if (hash === H_PERFILES) enPerfiles.push(ruta)
    const salida = renombrar(gitShow(hash, ruta), ruta, faltas)
    salida.split('\n').forEach((l, i) => {
      if (PROHIBIDO.test(l)) restos.push(`${ruta}:${i + 1}: ${l.trim().slice(0, 120)}`)
    })
    const destino = join(RAIZ, DESTINO[ruta] ?? ruta)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, salida)
  }
  for (const [nombre, [ancho, alto, modo]] of Object.entries(LOGOS)) {
    const destino = join(RAIZ, 'public/brand', nombre)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, logo(ancho, alto, modo))
  }
  console.log(`Copiados ${ARCHIVOS.length} archivos de ${H}; en ${H_PERFILES}: ${enPerfiles.join(', ') || 'ninguno'}`)
  if (faltas.length || restos.length) {
    if (faltas.length) console.error(`Sin destino en el mapa:\n${[...new Set(faltas)].join('\n')}`)
    if (restos.length) console.error(`Texto de la marca tras el reemplazo:\n${restos.join('\n')}`)
    process.exit(1)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
