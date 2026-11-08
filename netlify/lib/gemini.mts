// Cliente mínimo de la API de Gemini (generateContent). Las funciones del
// portal (connector-proxy, mail-ai) no lo llaman directo: pasan por
// generarIA de netlify/lib/ia.mts, que toma modelos y topes del registro
// netlify/lib/ia-modelos.mts. Los valores por defecto de gemini() (lista
// global y 4096) quedan solo para quien lo llame sin registro.
//
// Seguridad: nunca se declaran herramientas — el modelo solo produce texto,
// no puede enviar correos, borrar datos ni llamar a ninguna API.
//
// Google retira modelos concretos con el tiempo, así que se prueba una
// lista de candidatos: si uno está retirado o saturado (o es una
// sobrescritura que rechaza la solicitud), el siguiente.

import type { SupabaseClient } from '@supabase/supabase-js'
import { GEMINI_VIGENTES, modelosPara, type RazonamientoIA } from './ia-modelos.mts'

// El modelo que ya funcionó en esta instancia caliente, por lista de
// candidatos: se prueba primero, pero solo dentro de su propia lista (una
// sobrescritura por función no se reordena por lo que funcionó en otra).
const vigentes = new Map<string, string>()

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

export interface GeminiResult {
  text: string
  model: string
  tokensIn: number
  // Incluye los tokens de razonamiento: Google los cobra como salida
  tokensOut: number
}

export interface OpcionesGemini {
  candidatos?: readonly string[]
  razonamiento?: RazonamientoIA
}

interface RespuestaGemini {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    thoughtsTokenCount?: number
  }
  error?: { message?: string; status?: string }
}

async function llamarModelo(
  model: string,
  system: string,
  prompt: string,
  maxTokens: number,
  razonamiento: RazonamientoIA
): Promise<GeminiResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // Gemini 3 razona por defecto en nivel alto: más lento y caro, y
        // con un tope chico la respuesta visible puede quedar vacía
        generationConfig: {
          maxOutputTokens: maxTokens,
          thinkingConfig: { thinkingLevel: razonamiento },
        },
      }),
    }
  )
  const body = (await res.json().catch(() => ({}))) as RespuestaGemini
  if (!res.ok) {
    const status = body.error?.status ?? String(res.status)
    const mensaje = body.error?.message || `Gemini respondió ${res.status}`
    const e = new Error(mensaje)
    // Un 400 no siempre es la clave: también lo da un parámetro que el
    // modelo no admite, y ese detalle hay que verlo (GeminiSolicitud). El
    // modelo retirado se mira antes que la clave: Google también lo anuncia
    // con un 403 («is no longer available»), y eso no es una clave inválida
    // sino motivo para probar el siguiente candidato.
    e.name =
      status === 'RESOURCE_EXHAUSTED' || res.status === 429
        ? 'GeminiRateLimit'
        : res.status === 503 || /high demand|overloaded|try again later/i.test(mensaje)
          ? 'GeminiSaturado'
          : res.status === 404 || /no longer available|not found for api version|is not supported for generatecontent/i.test(mensaje)
            ? 'GeminiModelo'
            : res.status === 401 || res.status === 403 || /api key/i.test(mensaje)
              ? 'GeminiAuth'
              : res.status === 400
                ? 'GeminiSolicitud'
                : 'GeminiError'
    throw e
  }
  const uso = body.usageMetadata
  return {
    // Las partes de razonamiento (thought) nunca llegan a la respuesta
    text: (body.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
      .trim(),
    model,
    tokensIn: uso?.promptTokenCount ?? 0,
    tokensOut: (uso?.candidatesTokenCount ?? 0) + (uso?.thoughtsTokenCount ?? 0),
  }
}

// Recorre los candidatos hasta dar con un modelo disponible para esta cuenta.
export async function gemini(
  system: string,
  prompt: string,
  maxTokens = 4096,
  opciones: OpcionesGemini = {}
): Promise<GeminiResult> {
  const candidatos = opciones.candidatos?.length ? [...opciones.candidatos] : modelosPara()
  const clave = candidatos.join(',')
  const vigente = vigentes.get(clave)
  const lista = vigente ? [vigente, ...candidatos.filter((m) => m !== vigente)] : candidatos
  let ultimo: Error | null = null
  for (const [i, model] of lista.entries()) {
    try {
      const r = await llamarModelo(model, system, prompt, maxTokens, opciones.razonamiento ?? 'low')
      vigentes.set(clave, model)
      return r
    } catch (err) {
      const e = err instanceof Error ? err : new Error('error desconocido')
      // Una sobrescritura (GEMINI_MODEL, IA_MODELO_<F>) puede ser un modelo
      // sin razonamiento que rechaza thinkingConfig con un 400: no tumba la
      // función mientras queden Flash vigentes por probar. En un vigente ese
      // 400 es un error nuestro y corta.
      if (e.name === 'GeminiSolicitud' && !GEMINI_VIGENTES.includes(model) && i < lista.length - 1) {
        console.error(`gemini: modelo ${model} rechazó la solicitud (${e.message.slice(0, 200)}), probando el siguiente`)
        ultimo = e
        continue
      }
      // Modelo retirado o saturado ("high demand"): probar el siguiente de
      // la lista; cualquier otro error corta de una.
      if (e.name !== 'GeminiModelo' && e.name !== 'GeminiSaturado') throw e
      console.error(`gemini: modelo ${model} ${e.name === 'GeminiSaturado' ? 'saturado' : 'no disponible'}, probando el siguiente`)
      ultimo = e
    }
  }
  throw ultimo ?? new Error('Ningún modelo de Gemini disponible')
}

// Deja constancia del consumo en ai_usage para el cuadro de costos del panel
// de administración. Fail-soft: si la tabla no existe todavía (migración 28)
// o el insert falla, la función principal no se rompe.
export async function registrarUsoIA(
  admin: SupabaseClient,
  feature: string,
  r: GeminiResult | { model: string; tokensIn: number; tokensOut: number },
  userId: string | null
): Promise<void> {
  try {
    const { error } = await admin.from('ai_usage').insert({
      feature,
      model: r.model,
      tokens_in: r.tokensIn,
      tokens_out: r.tokensOut,
      user_id: userId,
    })
    if (error) console.error('ai_usage no registrado:', error.message)
  } catch (err) {
    console.error('ai_usage no registrado:', err instanceof Error ? err.message : err)
  }
}
