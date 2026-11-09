import { describe, expect, it } from 'vitest'
import { esUrlMarca, logoDe, logosValidos } from '../instalacion'

const BASE = 'https://x.supabase.co'
const BUENA = `${BASE}/storage/v1/object/public/marca/logos/1-a.webp`

describe('logos de la instalación', () => {
  it('solo URLs del bucket marca, sin salirse de él', () => {
    expect(esUrlMarca(BUENA, BASE)).toBe(true)
    expect(esUrlMarca(`${BASE}/storage/v1/object/public/avatares/a.png`, BASE)).toBe(false)
    expect(esUrlMarca(`${BASE}/storage/v1/object/public/marca/../avatares/a.png`, BASE)).toBe(false)
    expect(esUrlMarca('https://otro.com/a.png', BASE)).toBe(false)
    expect(esUrlMarca(BUENA, '')).toBe(false)
  })
  it('descarta claves ajenas y URLs no válidas; sin logo, el archivo neutro', () => {
    const l = logosValidos({ favicon: BUENA, banner: 'javascript:x', otra: BUENA }, BASE)
    expect(l).toEqual({ favicon: BUENA })
    expect(logoDe(l, 'banner')).toBe('/brand/logo-banner-transp.png')
    expect(logosValidos([BUENA], BASE)).toEqual({})
  })
})
