import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FEATURES_IA,
  GEMINI_VIGENTES,
  MODELOS_IA,
  backendPara,
  claveEnv,
  modelosPara,
} from '../ia-modelos.mts'

describe('registro de modelos', () => {
  it('Flash vigentes en orden, sin los retirados', () => {
    expect(GEMINI_VIGENTES).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'])
    for (const retirado of ['gemini-flash-latest', 'gemini-3-flash', 'gemini-2.5-flash']) {
      expect(GEMINI_VIGENTES).not.toContain(retirado)
    }
  })

  it('las 7 funciones tienen entrada y todas arrancan en Gemini', () => {
    expect(Object.keys(MODELOS_IA).sort()).toEqual([...FEATURES_IA].sort())
    for (const f of FEATURES_IA) {
      expect(MODELOS_IA[f]).toMatchObject({
        backend: 'gemini',
        gemini: GEMINI_VIGENTES,
        razonamiento: 'low',
        esperaLocalSeg: 30,
      })
      expect(MODELOS_IA[f].maxTokens).toBeGreaterThanOrEqual(4096)
    }
    expect(MODELOS_IA['blog-draft'].maxTokens).toBe(8192)
  })

  it('ningún id de Claude en el registro', () => {
    expect(JSON.stringify(MODELOS_IA)).not.toMatch(/claude/i)
  })

  it('claveEnv', () => {
    expect(claveEnv('IA_MODELO_', 'resumen-gerencia')).toBe('IA_MODELO_RESUMEN_GERENCIA')
    expect(claveEnv('IA_BACKEND_', 'reporte-proyecto')).toBe('IA_BACKEND_REPORTE_PROYECTO')
  })
})

describe('backendPara', () => {
  it('sin entorno: el del registro (gemini)', () => {
    for (const f of FEATURES_IA) expect(backendPara(f, {})).toBe('gemini')
  })

  it('IA_BACKEND_<F> cambia solo esa función', () => {
    const env = { IA_BACKEND_REPORTE_PROYECTO: ' Local ' }
    expect(backendPara('reporte-proyecto', env)).toBe('local')
    expect(backendPara('lead-reply', env)).toBe('gemini')
  })

  it('valor desconocido: se ignora', () => {
    expect(backendPara('blog-draft', { IA_BACKEND_BLOG_DRAFT: 'nube' })).toBe('gemini')
  })

  it('el correo queda fijo en Gemini', () => {
    const env = { IA_BACKEND_CORREO_RESUMEN: 'local', IA_BACKEND_CORREO_BORRADOR: 'local' }
    expect(backendPara('correo-resumen', env)).toBe('gemini')
    expect(backendPara('correo-borrador', env)).toBe('gemini')
  })

  it('el reporte de oportunidad queda fijo en Gemini', () => {
    expect(backendPara('reporte-oportunidad', { IA_BACKEND_REPORTE_OPORTUNIDAD: 'local' })).toBe('gemini')
  })
})

describe('modelosPara', () => {
  it('sin entorno: los vigentes', () => {
    expect(modelosPara('reporte-proyecto', {})).toEqual([...GEMINI_VIGENTES])
    expect(modelosPara(undefined, {})).toEqual([...GEMINI_VIGENTES])
  })

  it('IA_MODELO_<F> va primero, sin duplicados', () => {
    const env = { IA_MODELO_REPORTE_PROYECTO: 'gemini-4-flash, gemini-3.7-flash' }
    expect(modelosPara('reporte-proyecto', env)).toEqual([
      'gemini-4-flash',
      'gemini-3.7-flash',
      'gemini-3.8-flash',
      'gemini-3.6-flash',
    ])
    expect(modelosPara('resumen-gerencia', env)).toEqual([...GEMINI_VIGENTES])
  })

  it('ignora ids que no son de Gemini', () => {
    const env = { IA_MODELO_LEAD_REPLY: 'claude-sonnet-5-5,gpt-5, ,gemini-x-prueba', GEMINI_MODEL: 'claude-opus-4-8' }
    expect(modelosPara('lead-reply', env)).toEqual(['gemini-x-prueba', ...GEMINI_VIGENTES])
  })

  it('GEMINI_MODEL (heredada) va después de la propia de la función', () => {
    const env = { IA_MODELO_BLOG_DRAFT: 'gemini-a', GEMINI_MODEL: 'gemini-b' }
    expect(modelosPara('blog-draft', env)).toEqual(['gemini-a', 'gemini-b', ...GEMINI_VIGENTES])
    expect(modelosPara(undefined, env)).toEqual(['gemini-b', ...GEMINI_VIGENTES])
  })
})

describe('aviso de valores descartados', () => {
  // Módulo nuevo en cada prueba: el aviso es uno por variable e instancia
  let avisos: string[]
  beforeEach(() => {
    vi.resetModules()
    avisos = []
    vi.spyOn(console, 'warn').mockImplementation((m: string) => {
      avisos.push(m)
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  const cargar = () => import('../ia-modelos.mts')

  it('IA_MODELO_<F> y GEMINI_MODEL descartados: nombra la variable, nunca el valor, una sola vez', async () => {
    const m = await cargar()
    const env = {
      IA_MODELO_REPORTE_PROYECTO: 'models/gemini-3.8-flash,Gemini-3.7-Flash',
      GEMINI_MODEL: 'claude-opus-4-8',
    }
    expect(m.modelosPara('reporte-proyecto', env)).toEqual([...m.GEMINI_VIGENTES])
    m.modelosPara('reporte-proyecto', env)
    expect(avisos).toEqual([
      '[ia-modelos] IA_MODELO_REPORTE_PROYECTO tiene un valor no válido y se ignora',
      '[ia-modelos] GEMINI_MODEL tiene un valor no válido y se ignora',
    ])
    expect(avisos.join(' ')).not.toMatch(/models\/|claude|Gemini-3/)
  })

  it('IA_BACKEND_<F> desconocido o correo fuera de Gemini: aviso; vacío o válido: nada', async () => {
    const m = await cargar()
    expect(m.backendPara('blog-draft', { IA_BACKEND_BLOG_DRAFT: 'nube' })).toBe('gemini')
    expect(m.backendPara('correo-resumen', { IA_BACKEND_CORREO_RESUMEN: 'local' })).toBe('gemini')
    expect(m.backendPara('lead-reply', { IA_BACKEND_LEAD_REPLY: ' Local ' })).toBe('local')
    expect(m.backendPara('resumen-gerencia', { IA_BACKEND_RESUMEN_GERENCIA: '' })).toBe('gemini')
    expect(m.modelosPara('lead-reply', { IA_MODELO_LEAD_REPLY: 'gemini-x-prueba, ' })).toEqual([
      'gemini-x-prueba',
      ...m.GEMINI_VIGENTES,
    ])
    expect(avisos).toEqual([
      '[ia-modelos] IA_BACKEND_BLOG_DRAFT tiene un valor no válido y se ignora',
      '[ia-modelos] IA_BACKEND_CORREO_RESUMEN tiene un valor no válido y se ignora',
    ])
  })
})
