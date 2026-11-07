import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// .env.example es el inventario de variables del producto (seguridad.md):
// toda variable que lee el código (import.meta.env.VITE_* en src,
// process.env.* en netlify y tools) figura allí, vacía y bajo una de las
// tres clases. Las VITE_* son públicas por construcción; lo que se llama
// clave, secreto, contraseña, token o cadena de base es secreto.

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))
const CARPETAS = ['src', 'netlify', 'tools']
const SALTAR = new Set(['node_modules', '__tests__', 'dist'])
const EXTENSIONES = /\.(ts|tsx|mts|mjs|js)$/
const VITE_PROPIAS = new Set(['DEV', 'PROD', 'MODE', 'BASE_URL', 'SSR'])
const CLASES = ['PÚBLICA', 'SECRETA', 'NO SENSIBLE'] as const
type Clase = (typeof CLASES)[number]

function archivos(dir: string, salida: string[] = []): string[] {
  const st = statSync(dir, { throwIfNoEntry: false })
  if (!st?.isDirectory()) return salida
  for (const nombre of readdirSync(dir)) {
    if (SALTAR.has(nombre)) continue
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) archivos(ruta, salida)
    else if (EXTENSIONES.test(nombre) && !/\.test\./.test(nombre) && !nombre.endsWith('.d.ts')) salida.push(ruta)
  }
  return salida
}

// nombre de variable → archivos que la leen
function variablesDelCodigo(): Map<string, string[]> {
  const mapa = new Map<string, string[]>()
  for (const ruta of CARPETAS.flatMap((c) => archivos(join(RAIZ, c)))) {
    const texto = readFileSync(ruta, 'utf8')
    const nombres = [
      ...[...texto.matchAll(/import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g)].map((m) => m[1]).filter((n) => !VITE_PROPIAS.has(n)),
      ...[...texto.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)].map((m) => m[1]),
    ]
    for (const n of new Set(nombres)) mapa.set(n, [...(mapa.get(n) ?? []), relative(RAIZ, ruta)])
  }
  return mapa
}

type Entrada = { clase: Clase | null; valor: string; linea: number }

function variablesDelEjemplo(): Map<string, Entrada> {
  const mapa = new Map<string, Entrada>()
  let clase: Clase | null = null
  readFileSync(join(RAIZ, '.env.example'), 'utf8').split(/\r?\n/).forEach((linea, i) => {
    const cabecera = /^# --- (PÚBLICA|SECRETA|NO SENSIBLE)\b/.exec(linea)
    if (cabecera) clase = cabecera[1] as Clase
    const v = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(linea)
    if (v) mapa.set(v[1], { clase, valor: v[2], linea: i + 1 })
  })
  return mapa
}

const CODIGO = variablesDelCodigo()
const EJEMPLO = variablesDelEjemplo()
const SECRETA_POR_NOMBRE = /(_KEY|_SECRET|_PASS|_PASSWORD|_TOKEN|_DB_URL)$/

describe('.env.example', () => {
  it('lista toda variable que lee el código', () => {
    expect(CODIGO.size).toBeGreaterThan(0)
    for (const [nombre, rutas] of CODIGO) expect(EJEMPLO.has(nombre), `${nombre} (${rutas.join(', ')}) falta en .env.example`).toBe(true)
  })

  it('cada variable está bajo una clase y sin valor', () => {
    expect(EJEMPLO.size).toBeGreaterThan(0)
    for (const [nombre, e] of EJEMPLO) {
      expect(e.clase, `${nombre} (línea ${e.linea}) sin clase`).not.toBeNull()
      expect(e.valor, `${nombre} (línea ${e.linea}) lleva valor`).toBe('')
    }
  })

  it('las VITE_* son públicas y las que se llaman clave, secreto, contraseña, token o cadena de base son secretas', () => {
    for (const [nombre, e] of EJEMPLO) {
      if (nombre.startsWith('VITE_')) {
        expect(e.clase, nombre).toBe('PÚBLICA')
        expect(SECRETA_POR_NOMBRE.test(nombre.replace(/^VITE_/, '')) && nombre !== 'VITE_SUPABASE_ANON_KEY', `${nombre} no puede ir al navegador`).toBe(false)
      } else if (SECRETA_POR_NOMBRE.test(nombre)) {
        expect(e.clase, nombre).toBe('SECRETA')
      }
    }
  })
})
