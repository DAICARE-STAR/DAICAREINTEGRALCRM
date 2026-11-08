// Registro central de modelos de IA del portal: una entrada por función
// (el mismo nombre que la columna feature de ai_usage). Es el único lugar
// del código con ids de modelo; el resto los pide por función.
//
// backend: 'gemini' es la API de pago de Google AI Studio (netlify/lib/ia.mts);
// 'local' es el worker de bot con Ollama en el Ryzen, que atiende la
// cola ia_trabajos (migración 68). Todas arrancan en 'gemini' y pasan a
// 'local' una por una, solo si aprueban la prueba comparativa de
// tools/ia-local; el correo queda siempre en Gemini (sus cuerpos no se
// guardan en Supabase).
//
// Sobrescrituras por variable de entorno (Netlify), sin tocar código:
//  · IA_BACKEND_<FUNCION>=local|gemini  (p. ej. IA_BACKEND_REPORTE_PROYECTO)
//  · IA_MODELO_<FUNCION>=id[,id…]       ids gemini-* que van antes de los
//    vigentes; cualquier otro id (claude-*, etc.) se ignora
//  · GEMINI_MODEL                        sobrescritura global heredada, va
//    después de la propia de cada función
// Un valor que no pasa el filtro (mayúsculas, prefijo models/, claude-*,
// un backend desconocido) se descarta con un console.warn por instancia
// que nombra la variable, nunca su valor.
//
// Funciones sin I/O (salvo ese aviso): reciben el entorno para poder
// probarlas.

// Flash estables vigentes, del más nuevo al más viejo (ai.google.dev/
// gemini-api/docs/models, consultado el 2026-09-29). Se retiraron el alias
// gemini-flash-latest (cambia de modelo y de precio sin aviso),
// gemini-3-flash (el id real era gemini-3-flash-preview) y
// gemini-2.5-flash (restringido a cuentas que ya lo usaban). La tarea
// trimestral P09 del calendario de mantenimiento revisa esta lista.
export const GEMINI_VIGENTES: readonly string[] = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
]

export const FEATURES_IA = [
  'reporte-proyecto',
  'reporte-oportunidad',
  'resumen-gerencia',
  'blog-draft',
  'lead-reply',
  'correo-resumen',
  'correo-borrador',
] as const
export type FeatureIA = (typeof FEATURES_IA)[number]

export type BackendIA = 'local' | 'gemini'
export type RazonamientoIA = 'low' | 'medium' | 'high'

export interface ConfigIA {
  backend: BackendIA
  gemini: readonly string[]
  // Tope de salida; en Gemini 3 incluye los tokens de razonamiento
  maxTokens: number
  razonamiento: RazonamientoIA
  // Segundos que la app espera a que el worker local reclame el trabajo
  // antes de pedir el respaldo en Gemini
  esperaLocalSeg: number
}

const BASE = {
  backend: 'gemini',
  gemini: GEMINI_VIGENTES,
  razonamiento: 'low',
  esperaLocalSeg: 30,
} as const

export const MODELOS_IA: Readonly<Record<FeatureIA, ConfigIA>> = {
  'reporte-proyecto': { ...BASE, maxTokens: 4096 },
  'reporte-oportunidad': { ...BASE, maxTokens: 4096 },
  'resumen-gerencia': { ...BASE, maxTokens: 4096 },
  'blog-draft': { ...BASE, maxTokens: 8192 },
  'lead-reply': { ...BASE, maxTokens: 4096 },
  'correo-resumen': { ...BASE, maxTokens: 4096 },
  'correo-borrador': { ...BASE, maxTokens: 4096 },
}

const SOLO_GEMINI: ReadonlySet<FeatureIA> = new Set<FeatureIA>(['correo-resumen', 'correo-borrador', 'reporte-oportunidad'])

type Entorno = Record<string, string | undefined>

// Un aviso por variable y por instancia fría: el registro se consulta en
// cada llamada y no hace falta repetirlo
const avisadas = new Set<string>()
function avisarDescarte(variable: string): void {
  if (avisadas.has(variable)) return
  avisadas.add(variable)
  console.warn(`[ia-modelos] ${variable} tiene un valor no válido y se ignora`)
}

// 'resumen-gerencia' → 'IA_MODELO_RESUMEN_GERENCIA'
export function claveEnv(prefijo: 'IA_BACKEND_' | 'IA_MODELO_', feature: FeatureIA): string {
  return prefijo + feature.toUpperCase().replace(/-/g, '_')
}

export function backendPara(feature: FeatureIA, env: Entorno = process.env): BackendIA {
  const variable = claveEnv('IA_BACKEND_', feature)
  const valor = env[variable]?.trim().toLowerCase()
  if (SOLO_GEMINI.has(feature)) {
    if (valor && valor !== 'gemini') avisarDescarte(variable)
    return 'gemini'
  }
  if (valor === 'local' || valor === 'gemini') return valor
  if (valor) avisarDescarte(variable)
  return MODELOS_IA[feature].backend
}

const ID_GEMINI = /^gemini-[a-z0-9][a-z0-9.-]{0,60}$/

function idsGemini(env: Entorno, variable: string): string[] {
  const piezas = (env[variable] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const validos = piezas.filter((s) => ID_GEMINI.test(s))
  if (validos.length < piezas.length) avisarDescarte(variable)
  return validos
}

// Candidatos de Gemini en orden de prueba, sin duplicados. Sin función:
// la lista global (GEMINI_MODEL + vigentes) para las llamadas heredadas.
export function modelosPara(feature?: FeatureIA, env: Entorno = process.env): string[] {
  const propios = feature ? idsGemini(env, claveEnv('IA_MODELO_', feature)) : []
  const base = feature ? MODELOS_IA[feature].gemini : GEMINI_VIGENTES
  return [...new Set([...propios, ...idsGemini(env, 'GEMINI_MODEL'), ...base])]
}
