import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// generarIA y gemini() con fetch simulado: sin red y sin costo. El módulo
// se vuelve a cargar en cada prueba porque gemini.mts recuerda el modelo
// que funcionó en la instancia.

const VIGENTES = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']

interface Llamada {
  url: string
  modelo: string
  headers: Record<string, string>
  body: {
    systemInstruction: { parts: { text: string }[] }
    contents: { role: string; parts: { text: string }[] }[]
    generationConfig: { maxOutputTokens: number; thinkingConfig: { thinkingLevel: string } }
  }
}
interface Simulada {
  status: number
  body: unknown
}

function simularFetch(responder: (modelo: string) => Simulada): Llamada[] {
  const llamadas: Llamada[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const modelo = /models\/([^:]+):generateContent$/.exec(url)?.[1] ?? ''
      llamadas.push({
        url,
        modelo,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(init.body as string),
      })
      const r = responder(modelo)
      return new Response(JSON.stringify(r.body), { status: r.status })
    })
  )
  return llamadas
}

const USO = { promptTokenCount: 900, candidatesTokenCount: 120, thoughtsTokenCount: 380 }
const exito = (texto: string, uso: object = USO): Simulada => ({
  status: 200,
  body: { candidates: [{ content: { parts: [{ text: texto }] } }], usageMetadata: uso },
})
const fallo = (status: number, message: string, estado?: string): Simulada => ({
  status,
  body: { error: { code: status, message, status: estado } },
})

function adminFalso(insertFalla = false) {
  const filas: Record<string, unknown>[] = []
  const admin = {
    from: (tabla: string) => ({
      insert: async (fila: Record<string, unknown>) => {
        if (insertFalla) throw new Error('sin red')
        filas.push({ tabla, ...fila })
        return { error: null }
      },
    }),
  }
  return { admin: admin as unknown as SupabaseClient, filas }
}

const cargar = () => import('../ia.mts')
const envOriginal = { ...process.env }

beforeEach(() => {
  vi.resetModules()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const k of Object.keys(process.env)) {
    if (/^(IA_|GEMINI_|ANTHROPIC_)/.test(k)) delete process.env[k]
  }
  process.env.GEMINI_API_KEY = 'clave-de-prueba'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  process.env = { ...envOriginal }
})

describe('generarIA', () => {
  it('llama al primer Flash vigente con el tope y el razonamiento del registro', async () => {
    const llamadas = simularFetch(() => exito('**Resumen** listo'))
    const { admin, filas } = adminFalso()
    const { generarIA } = await cargar()

    const r = await generarIA(admin, 'reporte-proyecto', 'SISTEMA', '<proyecto>\nX\n</proyecto>', 'u1')

    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent'
    )
    expect(llamadas[0].headers['x-goog-api-key']).toBe('clave-de-prueba')
    expect(llamadas[0].body.systemInstruction.parts[0].text).toBe('SISTEMA')
    expect(llamadas[0].body.contents).toEqual([{ role: 'user', parts: [{ text: '<proyecto>\nX\n</proyecto>' }] }])
    expect(llamadas[0].body.generationConfig).toEqual({
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingLevel: 'low' },
    })
    expect(r).toEqual({ text: '**Resumen** listo', model: 'gemini-3.8-flash', tokensIn: 900, tokensOut: 500 })
    expect(filas).toEqual([
      {
        tabla: 'ai_usage',
        feature: 'reporte-proyecto',
        model: 'gemini-3.8-flash',
        tokens_in: 900,
        tokens_out: 500,
        user_id: 'u1',
      },
    ])
  })

  it('modelo retirado (404): pasa al siguiente y lo recuerda', async () => {
    const llamadas = simularFetch((m) =>
      m === 'gemini-3.8-flash' ? fallo(404, 'models/gemini-3.8-flash is not found for API version v1beta', 'NOT_FOUND') : exito('ok')
    )
    const { admin, filas } = adminFalso()
    const { generarIA } = await cargar()

    const r = await generarIA(admin, 'lead-reply', 's', 'p', 'u1')
    expect(r.model).toBe('gemini-3.7-flash')
    expect(filas[0]).toMatchObject({ model: 'gemini-3.7-flash', feature: 'lead-reply' })

    await generarIA(admin, 'lead-reply', 's', 'p', 'u1')
    expect(llamadas.map((l) => l.modelo)).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.7-flash'])
  })

  it.each([
    [fallo(403, 'Model gemini-3.8-flash is no longer available to new users.', 'PERMISSION_DENIED')],
    [fallo(400, 'The model gemini-3.8-flash is no longer available.', 'INVALID_ARGUMENT')],
  ])('modelo retirado con 403 o 400 («no longer available»): GeminiModelo, salta al siguiente', async (retirado) => {
    const llamadas = simularFetch((m) => (m === 'gemini-3.8-flash' ? retirado : exito('ok')))
    const { admin, filas } = adminFalso()
    const { generarIA } = await cargar()

    const r = await generarIA(admin, 'resumen-gerencia', 's', 'p', 'u1')
    expect(r.model).toBe('gemini-3.7-flash')
    expect(llamadas.map((l) => l.modelo)).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash'])
    expect(filas).toEqual([expect.objectContaining({ model: 'gemini-3.7-flash' })])
  })

  it('el modelo recordado vale solo dentro de su propia lista de candidatos', async () => {
    process.env.IA_MODELO_BLOG_DRAFT = 'gemini-propio'
    const llamadas = simularFetch((m) =>
      m === 'gemini-3.8-flash' ? fallo(404, 'models/gemini-3.8-flash is not found for API version v1beta', 'NOT_FOUND') : exito('ok')
    )
    const { admin } = adminFalso()
    const { generarIA } = await cargar()

    // Vigentes: 3.8 retirado, recuerda 3.7 para esa lista
    await generarIA(admin, 'lead-reply', 's', 'p', 'u1')
    // Otra lista (con la sobrescritura del blog): no se reordena por lo de arriba
    await generarIA(admin, 'blog-draft', 's', 'p', 'u1')
    // La misma lista de vigentes: empieza por el recordado
    await generarIA(admin, 'resumen-gerencia', 's', 'p', 'u1')
    expect(llamadas.map((l) => l.modelo)).toEqual([
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-propio',
      'gemini-3.7-flash',
    ])
  })

  it('todos saturados: falla con GeminiSaturado, sin otro proveedor ni registro', async () => {
    const llamadas = simularFetch(() => fallo(503, 'The model is overloaded. Please try again later.', 'UNAVAILABLE'))
    const { admin, filas } = adminFalso()
    const { generarIA } = await cargar()

    await expect(generarIA(admin, 'resumen-gerencia', 's', 'p', 'u1')).rejects.toMatchObject({
      name: 'GeminiSaturado',
    })
    expect(llamadas.map((l) => l.modelo)).toEqual(VIGENTES)
    expect(llamadas.every((l) => l.url.startsWith('https://generativelanguage.googleapis.com/'))).toBe(true)
    expect(filas).toEqual([])
  })

  it.each([
    [fallo(401, 'Unauthorized'), 'GeminiAuth'],
    [fallo(403, 'Permission denied', 'PERMISSION_DENIED'), 'GeminiAuth'],
    [fallo(400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT'), 'GeminiAuth'],
    [fallo(400, 'Invalid value at generation_config.thinking_config.thinking_level', 'INVALID_ARGUMENT'), 'GeminiSolicitud'],
    [fallo(429, 'Quota exceeded', 'RESOURCE_EXHAUSTED'), 'GeminiRateLimit'],
    [fallo(500, 'Internal error', 'INTERNAL'), 'GeminiError'],
  ])('error sin reintento: %j → %s', async (respuesta, nombre) => {
    const llamadas = simularFetch(() => respuesta)
    const { admin, filas } = adminFalso()
    const { generarIA } = await cargar()

    const err = await generarIA(admin, 'blog-draft', 's', 'p', 'u1').catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).name).toBe(nombre)
    expect((err as Error).message).toBe((respuesta.body as { error: { message: string } }).error.message)
    expect(llamadas).toHaveLength(1)
    expect(filas).toEqual([])
  })

  it('GEMINI_MODEL sin razonamiento (400 por thinkingConfig): sigue con los vigentes y lo salta después', async () => {
    process.env.GEMINI_MODEL = 'gemini-2.0-flash'
    const llamadas = simularFetch((m) =>
      m === 'gemini-2.0-flash'
        ? fallo(400, 'Thinking is not supported for this model.', 'INVALID_ARGUMENT')
        : exito('ok')
    )
    const { admin, filas } = adminFalso()
    const { generarIA } = await cargar()

    const r = await generarIA(admin, 'reporte-proyecto', 's', 'p', 'u1')
    expect(r.model).toBe('gemini-3.8-flash')
    expect(filas[0]).toMatchObject({ model: 'gemini-3.8-flash', feature: 'reporte-proyecto' })

    await generarIA(admin, 'reporte-proyecto', 's', 'p', 'u1')
    expect(llamadas.map((l) => l.modelo)).toEqual(['gemini-2.0-flash', 'gemini-3.8-flash', 'gemini-3.8-flash'])
  })

  it('IA_MODELO_<F> que rechaza la solicitud (400) cede al siguiente; un vigente no', async () => {
    process.env.IA_MODELO_LEAD_REPLY = 'gemini-mal-escrito'
    const llamadas = simularFetch(() => fallo(400, 'Request contains an invalid argument.', 'INVALID_ARGUMENT'))
    const { admin, filas } = adminFalso()
    const { generarIA } = await cargar()

    await expect(generarIA(admin, 'lead-reply', 's', 'p', 'u1')).rejects.toMatchObject({ name: 'GeminiSolicitud' })
    expect(llamadas.map((l) => l.modelo)).toEqual(['gemini-mal-escrito', 'gemini-3.8-flash'])
    expect(filas).toEqual([])
  })

  it('IA_MODELO_<F> va primero y los ids de Claude se ignoran', async () => {
    process.env.IA_MODELO_BLOG_DRAFT = 'claude-sonnet-5-5,gemini-x-prueba'
    const llamadas = simularFetch((m) => (m === 'gemini-x-prueba' ? fallo(404, 'no') : exito('TITULO: T\n---\nC')))
    const { admin } = adminFalso()
    const { generarIA } = await cargar()

    const r = await generarIA(admin, 'blog-draft', 's', 'p', null)
    expect(llamadas.map((l) => l.modelo)).toEqual(['gemini-x-prueba', 'gemini-3.8-flash'])
    expect(llamadas[0].body.generationConfig.maxOutputTokens).toBe(8192)
    expect(r.model).toBe('gemini-3.8-flash')
    expect(llamadas.some((l) => /claude|anthropic/i.test(l.url))).toBe(false)
  })

  it('respuesta vacía: registra el consumo y falla con IAVacia', async () => {
    simularFetch(() => exito('   ', { promptTokenCount: 50, thoughtsTokenCount: 4096 }))
    const { admin, filas } = adminFalso()
    const { generarIA } = await cargar()

    await expect(generarIA(admin, 'correo-resumen', 's', 'p', 'u1')).rejects.toMatchObject({ name: 'IAVacia' })
    expect(filas).toEqual([
      expect.objectContaining({ feature: 'correo-resumen', tokens_in: 50, tokens_out: 4096 }),
    ])
  })

  it('las partes de razonamiento no llegan al texto', async () => {
    simularFetch(() => ({
      status: 200,
      body: {
        candidates: [{ content: { parts: [{ text: 'pensando…', thought: true }, { text: 'Respuesta' }] } }],
        usageMetadata: USO,
      },
    }))
    const { admin } = adminFalso()
    const { generarIA } = await cargar()

    expect((await generarIA(admin, 'correo-borrador', 's', 'p', 'u1')).text).toBe('Respuesta')
  })

  it('si ai_usage falla, la respuesta llega igual', async () => {
    simularFetch(() => exito('ok'))
    const { admin } = adminFalso(true)
    const { generarIA } = await cargar()

    await expect(generarIA(admin, 'lead-reply', 's', 'p', 'u1')).resolves.toMatchObject({ text: 'ok' })
  })
})

describe('iaConfigurada', () => {
  it('depende solo de GEMINI_API_KEY', async () => {
    const { iaConfigurada } = await cargar()
    expect(iaConfigurada()).toBe(true)
    delete process.env.GEMINI_API_KEY
    process.env.ANTHROPIC_API_KEY = 'otra'
    expect(iaConfigurada()).toBe(false)
  })
})

describe('gemini() sin registro (valores por defecto)', () => {
  it('sin opciones: GEMINI_MODEL + vigentes, 4096 y razonamiento bajo', async () => {
    process.env.GEMINI_MODEL = 'gemini-heredado'
    const llamadas = simularFetch(() => fallo(404, 'not found', 'NOT_FOUND'))
    const { gemini } = await import('../gemini.mts')

    await expect(gemini('s', 'p')).rejects.toMatchObject({ name: 'GeminiModelo' })
    expect(llamadas.map((l) => l.modelo)).toEqual(['gemini-heredado', ...VIGENTES])
    expect(llamadas[0].body.generationConfig).toEqual({
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingLevel: 'low' },
    })
  })

  it('sin opciones y GEMINI_MODEL sin razonamiento: termina en el primer vigente', async () => {
    process.env.GEMINI_MODEL = 'gemini-2.0-flash'
    const llamadas = simularFetch((m) =>
      m === 'gemini-2.0-flash'
        ? fallo(400, 'Thinking is not supported for this model.', 'INVALID_ARGUMENT')
        : exito('ok')
    )
    const { gemini } = await import('../gemini.mts')

    await expect(gemini('s', 'p', 1500)).resolves.toMatchObject({ model: 'gemini-3.8-flash', text: 'ok' })
    expect(llamadas.map((l) => l.modelo)).toEqual(['gemini-2.0-flash', 'gemini-3.8-flash'])
  })

  it('respeta el tope que pasa el llamador y cuenta el razonamiento', async () => {
    const llamadas = simularFetch(() => exito('ok'))
    const { gemini } = await import('../gemini.mts')

    const r = await gemini('s', 'p', 1500)
    expect(llamadas[0].body.generationConfig.maxOutputTokens).toBe(1500)
    expect(r.tokensOut).toBe(500)
  })
})
