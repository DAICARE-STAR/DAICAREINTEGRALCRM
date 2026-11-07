// Escáner de secretos del repo (higiene de secretos, antes de cada commit y
// de cada subida). Sin dependencias. Nunca imprime el valor ni la línea:
// solo archivo:línea y el tipo de hallazgo.
//
// Uso (desde cualquier carpeta del repo):
//   node tools/seguridad/escanear-secretos.mjs              todo el repo: lo que sigue git y lo nuevo sin ignorar
//   node tools/seguridad/escanear-secretos.mjs docs tools   solo esas rutas (archivos o carpetas)
//   node tools/seguridad/escanear-secretos.mjs --staged     lo preparado para el próximo commit (el índice)
//   --todo                                                  también las pruebas y el arnés (datos falsos a propósito)
// Sale con 0 sin hallazgos, 1 con hallazgos y 2 por un error de uso.
//
// Copia adaptada de team-portal/tools/seguridad/escanear-secretos.mjs (hash en
// docs/origen.md): sin la lista de valores de fábrica de Wazuh ni las rutas
// permitidas del arnés de servidores, que no existen en el producto.
//
// Patrones: URLs con credenciales de cualquier esquema (redis://:clave@,
// https://usuario:clave@), claves en minúscula, apikey/api_key/apiKey con
// valor literal, «Authorization: Bearer <literal>», <key> y <password> en XML
// y contraseñas con $ ($$ en compose), también «$password = "…"» de
// PowerShell. No cuenta como secreto lo que lee una variable (process.env,
// ${…}, $VAR), lo que va entre <…> o […], los valores de ejemplo (xxxx,
// ejemplo, o test y prueba como palabra entera) ni, salvo en un *_PASSWORD,
// *_PASS, *_TOKEN, *_SECRET o *_KEY, una palabra en minúscula (prosa) o un
// acceso a un miembro (a.b).
// En el código (.js, .ts, .html, .sql, .ps1…) una asignación solo cuenta con
// el valor entre comillas: sin ellas es otra variable. Una línea con
// «escanear-secretos: ignorar» se salta (solo para datos de prueba).

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const IGNORAR_LINEA = 'escanear-secretos: ignorar'
const MAX_BYTES = 2 * 1024 * 1024
const BINARIOS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp', '.pdf', '.zip', '.gz', '.tgz', '.7z', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.webm', '.mov', '.wasm', '.xlsx', '.docx', '.pptx'])
const CODIGO = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx', '.html', '.htm', '.vue', '.svelte', '.sql', '.ps1', '.psm1', '.py'])
const SALTAR_CARPETAS = new Set(['.git', 'node_modules', 'dist', '.netlify'])
// Generados: hashes de integridad y nombres de paquetes
const GENERADOS = /(^|\/)(package-lock\.json|[^/]+\.lock)$/
// Datos falsos a propósito: las pruebas. --todo las revisa.
export const PERMITIDOS = [/(^|\/)__tests__\//, /\.test\.[cm]?[jt]sx?$/]

// Lee una variable, una plantilla o es código: no es un literal
const REFERENCIA = /process\.env|import\.meta|os\.environ|Deno\.env|getenv|env\[|\$\{|\{\{|^\$[A-Za-z_({]|^\\\$|^%[A-Za-z_]|^\[|\(/
// Valor de ejemplo o de prueba. Las marcas largas cuentan en cualquier parte;
// las cortas (test, prueba, fake…) solo como palabra entera, para no tomar
// por ejemplo una clave real como «Latest#2026x» o «Contest2024!».
const EJEMPLO = /x{4,}|\*{3,}|\.{3}|…|changeme|example|ejemplo|placeholder|redacted|fictici[oa]|tu[-_](clave|token|contrase)|your[-_]|^<.*>$|^\[.*\]$|^valor\b|^(usuario|user|clave|contrase[ñn]a|password|pass|secret|secreto|token)$/i
const PALABRAS_DE_EJEMPLO = new Set(['test', 'tests', 'testing', 'prueba', 'pruebas', 'dummy', 'fake', 'falso', 'falsa', 'falsos', 'falsas', 'simulado', 'simulada', 'simulados', 'simuladas', 'simulacion', 'simulación', 'cambiar', 'cambiame'])
export function esEjemplo(valor) {
  if (EJEMPLO.test(valor)) return true
  // Palabras: se corta en lo que no es letra y en el paso de minúscula a mayúscula (miTestToken)
  const palabras = valor.replace(/([a-záéíóúñü])([A-ZÁÉÍÓÚÑÜ])/g, '$1 $2').toLowerCase().split(/[^a-záéíóúñü]+/)
  return palabras.some((p) => PALABRAS_DE_EJEMPLO.has(p))
}
// Palabra o frase en minúscula: prosa o el nombre de otra cosa
const PALABRA = /^[a-záéíóúñü_ -]+$/
const LITERAL_DE_CODIGO = /^(true|false|null|undefined|none|string|number)$/i
// Una url sin credenciales (las que llevan van por url-con-credenciales), una ruta o un archivo
const URL_O_RUTA = /^[a-z][a-z0-9+.-]*:\/\/|^(\/|\.{1,2}\/|~\/)|\.(sh|ps1|mjs|cjs|js|ts|mts|json|ya?ml|env|txt|md|conf|sql|py|pem|key|crt|pass)$/i
// Nombra otra variable (INDEXER_PASSWORD, wazuh:API_PASSWORD, SUPABASE_URL)
const NOMBRE_DE_VARIABLE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:PASSWORD|PASSWD|PASS|TOKEN|SECRET|KEY|URL|USER|ID)\b/
// Acceso a un miembro (response.usage.input_tokens, s.decrypted_secret): código
const MIEMBRO = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/
// nombreSecreto: la clave es claramente de un secreto (SMTP_PASSWORD,
// API_TOKEN…): ahí un valor con puntos o de solo minúsculas también es una
// clave, no un miembro ni prosa.
function pareceSecreto(valor, minimo, comillas = true, nombreSecreto = false) {
  // Con espacios es una frase, no una clave
  if (!valor || valor.length < minimo || /\s/.test(valor)) return false
  if (REFERENCIA.test(valor) || esEjemplo(valor) || LITERAL_DE_CODIGO.test(valor)) return false
  if (URL_O_RUTA.test(valor) || NOMBRE_DE_VARIABLE.test(valor)) return false
  if (!nombreSecreto) {
    if (PALABRA.test(valor) || MIEMBRO.test(valor)) return false
    // Sin comillas, una palabra corta sin cifras ni símbolos es prosa o un identificador
    if (!comillas && valor.length < 20 && !/[0-9]|[^A-Za-z0-9_.-]/.test(valor)) return false
  }
  return true
}

// Formato de token conocido: basta con que no sea un ejemplo
const conFormato = (m) => !esEjemplo(m[0])

// JWT: la clave anónima de Supabase (role anon) es pública por diseño; la
// service role u otro token, no
function jwtSecreto(m) {
  if (esEjemplo(m[0])) return false
  const partes = m[0].split('.')
  if (partes.length < 2) return true
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))?.role !== 'anon'
  } catch {
    return true
  }
}

// Nombres de clave que llevan un secreto (mayúsculas o minúsculas):
// PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|MASTER_KEY|ENCRYPTION_KEY.
// No cuenta ${VAR:-…}: es una expansión. Un $ delante (grupo 1) solo vale en
// «$clave = "…"» (PowerShell); con : o sin comillas, $VAR lee una variable.
const CLAVE = String.raw`(?<![A-Za-z0-9_.$-])(?<!\$\{)(\$?)([A-Za-z0-9_.-]*(?:pass(?:wd|word)?|secret|token|api[_-]?key|master[_-]?key|encryption[_-]?key|access[_-]?key|private[_-]?key)[A-Za-z0-9_]*)`
// Claramente un secreto: *_PASSWORD, *_PASS, *_TOKEN, *_SECRET, *_KEY
const NOMBRE_SECRETO = /_(?:PASSWORD|PASSWD|PASS|TOKEN|SECRET|KEY)$/i
// En el código el valor va entre comillas (también ``); fuera de él, la tilde
// invertida es código de Markdown o de shell, no comillas. Grupos: 1 $,
// 2 clave, 3 separador, 4 comilla, 5 valor entre comillas, 6 valor suelto.
const asignacion = (comillas) =>
  new RegExp(String.raw`${CLAVE}["']?\s*([=:])\s*(?:([${comillas}])([^"'\x60\r\n]*)\4|([^\s"'\x60,;)}\]]+))`, 'gi')
const ASIGNACION_CODIGO = asignacion(String.raw`"'\x60`)
const ASIGNACION_TEXTO = asignacion(`"'`)

export const PATRONES = [
  { tipo: 'jwt', re: /eyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){0,2}/g, valida: jwtSecreto },
  { tipo: 'clave-sb-secret', re: /sb_secret_[A-Za-z0-9]+/g, valida: conFormato },
  {
    tipo: 'clave-de-proveedor',
    re: /(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[A-Za-z0-9_-]{30,}|GOCSPX-[A-Za-z0-9_-]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|ntn_[A-Za-z0-9]{20,}|pat-(?:na|eu)1-[0-9a-f-]{30,}|AKIA[0-9A-Z]{16})/g,
    valida: conFormato,
  },
  { tipo: 'token-telegram', re: /\b[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}/g, valida: conFormato },
  { tipo: 'push-kuma', re: /\/api\/push\/([A-Za-z0-9]{8,})/g, valida: (m) => !esEjemplo(m[1]) },
  { tipo: 'clave-privada', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, valida: () => true },
  {
    // postgres://, redis://:clave@, https://usuario:clave@
    tipo: 'url-con-credenciales',
    re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"`<>{}]*:([^\s@/'"`<>]+)@/gi,
    valida: (m) => {
      let clave = m[1]
      try {
        clave = decodeURIComponent(clave)
      } catch {
        // codificación rota: se mira tal cual
      }
      return pareceSecreto(clave, 4)
    },
  },
  {
    tipo: 'bearer-literal',
    re: /authorization["']?\s*[:=]\s*["'`]?bearer\s+([A-Za-z0-9._~+/=-]{16,})/gi,
    valida: (m) => pareceSecreto(m[1], 16),
  },
  {
    tipo: 'xml-clave',
    re: /<(key|password|passwd|secret|token|api_?key|client_secret)>([^<\s]{4,})<\/\1>/gi,
    valida: (m) => pareceSecreto(m[2], 4),
  },
  {
    // KEY=valor, KEY: valor, "key": "valor", key = 'valor'. En el código solo
    // con comillas. Con $ dentro ($$ en compose) se informa como contraseña con $.
    tipo: 'asignacion-secreta',
    re: (codigo) => (codigo ? ASIGNACION_CODIGO : ASIGNACION_TEXTO),
    valida: (m, { codigo }) => {
      const [, dolar, clave, separador, , entre, suelto] = m
      const comillas = entre !== undefined
      if (dolar && (separador !== '=' || !comillas)) return false
      const valor = comillas ? entre : codigo ? undefined : suelto
      if (!pareceSecreto(valor, /pass/i.test(clave) ? 6 : 8, comillas, NOMBRE_SECRETO.test(clave))) return false
      return valor.includes('$') ? 'contrasena-con-dolar' : true
    },
  },
]

// Hallazgos de un texto: [{ linea, tipo }], sin el valor
export function escanearTexto(texto, ruta = '') {
  const codigo = CODIGO.has(extname(ruta).toLowerCase())
  const hallazgos = []
  const lineas = texto.split(/\r?\n/)
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]
    if (linea.includes(IGNORAR_LINEA)) continue
    const tipos = new Set()
    for (const p of PATRONES) {
      for (const m of linea.matchAll(typeof p.re === 'function' ? p.re(codigo) : p.re)) {
        const r = p.valida(m, { codigo })
        if (r) tipos.add(typeof r === 'string' ? r : p.tipo)
      }
    }
    for (const tipo of tipos) hallazgos.push({ linea: i + 1, tipo })
  }
  return hallazgos
}

function git(raiz, args) {
  return execFileSync('git', args, { cwd: raiz, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
}

export function raizDelRepo(desde = fileURLToPath(new URL('.', import.meta.url))) {
  try {
    return git(desde, ['rev-parse', '--show-toplevel']).toString().trim()
  } catch {
    return resolve(desde, '..', '..')
  }
}

// Sin git: recorrido de carpetas, sin node_modules, dist ni .env reales
function recorrer(raiz, dir, salida) {
  for (const nombre of readdirSync(dir)) {
    if (SALTAR_CARPETAS.has(nombre)) continue
    const ruta = join(dir, nombre)
    const st = statSync(ruta, { throwIfNoEntry: false })
    if (!st) continue
    if (st.isDirectory()) recorrer(raiz, ruta, salida)
    else if (st.isFile() && (!/^\.env(\..*)?$/.test(nombre) || nombre === '.env.example')) salida.push(relative(raiz, ruta).split(sep).join('/'))
  }
  return salida
}

// Archivos a revisar, relativos a la raíz: lo que sigue git y lo nuevo que
// no está ignorado (.env, node_modules y dist quedan fuera por .gitignore).
export function listarArchivos(raiz, rutas = []) {
  try {
    const salida = git(raiz, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...rutas])
    return [...new Set(salida.toString('utf8').split('\0').filter(Boolean))].sort()
  } catch {
    const base = rutas.length ? rutas : ['.']
    return base.flatMap((r) => {
      const abs = resolve(raiz, r)
      const st = statSync(abs, { throwIfNoEntry: false })
      if (!st) return []
      return st.isDirectory() ? recorrer(raiz, abs, []) : [relative(raiz, abs).split(sep).join('/')]
    }).sort()
  }
}

function esBinario(buf) {
  return buf.subarray(0, 8000).includes(0)
}

// Revisa una lista de archivos. leer(ruta) → Buffer | null. todo: también
// los PERMITIDOS (datos falsos a propósito).
export function escanearArchivos(rutas, leer, { todo = false } = {}) {
  const hallazgos = []
  let revisados = 0
  for (const ruta of rutas) {
    if (BINARIOS.has(extname(ruta).toLowerCase()) || GENERADOS.test(ruta)) continue
    if (!todo && PERMITIDOS.some((re) => re.test(ruta))) continue
    const buf = leer(ruta)
    if (!buf || buf.length > MAX_BYTES || esBinario(buf)) continue
    revisados++
    for (const h of escanearTexto(buf.toString('utf8'), ruta)) hallazgos.push({ archivo: ruta, ...h })
  }
  return { hallazgos, revisados }
}

export function leerArgumentos(argv) {
  const o = { staged: false, todo: false, rutas: [] }
  for (const a of argv) {
    if (a === '--staged') o.staged = true
    else if (a === '--todo') o.todo = true
    else if (a === '--help' || a === '-h') o.ayuda = true
    else if (a.startsWith('-')) throw new Error(`Opción desconocida: ${a}`)
    else o.rutas.push(a)
  }
  if (o.staged && o.rutas.length) throw new Error('--staged no admite rutas')
  return o
}

export function main(argv = process.argv.slice(2), { raiz = raizDelRepo(), cwd = process.cwd(), log = console.log } = {}) {
  let o
  try {
    o = leerArgumentos(argv)
  } catch (e) {
    log(e.message)
    return 2
  }
  if (o.ayuda) {
    log('Uso: node tools/seguridad/escanear-secretos.mjs [--todo] [--staged | ruta…]')
    return 0
  }
  let archivos
  let leer
  if (o.staged) {
    archivos = git(raiz, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']).toString('utf8').split('\0').filter(Boolean)
    leer = (r) => {
      try {
        return git(raiz, ['show', `:${r}`])
      } catch {
        return null
      }
    }
  } else {
    const rutas = o.rutas.map((r) => relative(raiz, resolve(cwd, r)).split(sep).join('/') || '.')
    if (rutas.some((r) => r.startsWith('..'))) {
      log('Las rutas deben estar dentro del repo')
      return 2
    }
    archivos = listarArchivos(raiz, rutas)
    leer = (r) => {
      try {
        return readFileSync(join(raiz, r))
      } catch {
        return null
      }
    }
  }
  const { hallazgos, revisados } = escanearArchivos(archivos, leer, { todo: o.todo })
  for (const h of hallazgos) log(`${h.archivo}:${h.linea}  ${h.tipo}`)
  if (!hallazgos.length) {
    log(`Sin hallazgos (${revisados} archivos revisados).`)
    return 0
  }
  const nArchivos = new Set(hallazgos.map((h) => h.archivo)).size
  log(`\n${hallazgos.length} hallazgo(s) en ${nArchivos} archivo(s) de ${revisados} revisados. El valor no se muestra: revisa cada línea.`)
  return 1
}

const esPrincipal = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
if (esPrincipal) process.exit(main())
