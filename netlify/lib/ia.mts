// Punto único de llamada a la IA en la nube desde las Netlify Functions:
// generarIA toma de netlify/lib/ia-modelos.mts los candidatos, el tope de
// salida y el nivel de razonamiento de cada función, llama a Gemini de pago
// y deja el consumo (con los tokens de razonamiento) en ai_usage.
//
// Es solo Gemini: el camino local (worker de bot) lo decide la cola
// con backendPara() y, si el worker no responde a tiempo, el respaldo
// vuelve aquí. No hay proveedor Claude en ningún camino.

import type { SupabaseClient } from '@supabase/supabase-js'
import { gemini, geminiConfigured, registrarUsoIA, type GeminiResult } from './gemini.mts'
import { MODELOS_IA, modelosPara, type FeatureIA } from './ia-modelos.mts'

// Las funciones que migren a generarIA importan todo desde este módulo
export { registrarUsoIA, type GeminiResult }

export function iaConfigurada(): boolean {
  return geminiConfigured()
}

// Errores (e.name): GeminiAuth, GeminiSolicitud, GeminiRateLimit,
// GeminiSaturado, GeminiModelo, GeminiError e IAVacia. El consumo se
// registra aunque la respuesta llegue vacía: esos tokens igual se cobran.
export async function generarIA(
  admin: SupabaseClient,
  feature: FeatureIA,
  system: string,
  prompt: string,
  userId: string | null
): Promise<GeminiResult> {
  const cfg = MODELOS_IA[feature]
  const r = await gemini(system, prompt, cfg.maxTokens, {
    candidatos: modelosPara(feature),
    razonamiento: cfg.razonamiento,
  })
  await registrarUsoIA(admin, feature, r, userId)
  if (!r.text) {
    const e = new Error('La IA devolvió una respuesta vacía')
    e.name = 'IAVacia'
    throw e
  }
  return r
}
