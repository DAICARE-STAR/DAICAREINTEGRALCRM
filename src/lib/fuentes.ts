// Fuentes propias de una instalación (N-5): se declaran como familia, peso
// y archivo del bucket marca y se aplican con FontFace (CSSOM, sin CSS
// inyectado). Se guardan en instalacion.ajustes.nucleo.fuentes.

import { esUrlMarca } from './instalacion'

export type Fuente = { familia: string; peso: number; archivo: string }

const FAMILIA = /^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/
const ARCHIVO = /\.woff2?$/i
// Respaldo de --pal-fuente-cuerpo en paleta.css, sin Roboto
const RESPALDO = "'Segoe UI', system-ui, -apple-system, Arial, sans-serif"

// null si la declaración vale; si no, la razón
export function validarFuente(f: unknown, base: string): string | null {
  const x = f as Partial<Fuente> | null
  if (!x || typeof x !== 'object') return 'La fuente no es una declaración.'
  if (typeof x.familia !== 'string' || !FAMILIA.test(x.familia)) return 'La familia admite letras, números, espacios y guiones (hasta 40).'
  if (typeof x.peso !== 'number' || !Number.isInteger(x.peso) || x.peso < 100 || x.peso > 900) return 'El peso va de 100 a 900.'
  if (!esUrlMarca(x.archivo, base) || !ARCHIVO.test(x.archivo)) return 'El archivo debe ser un .woff2 o .woff del bucket marca.'
  return null
}

export function fuentesValidas(valor: unknown, base: string): Fuente[] {
  return Array.isArray(valor) ? (valor.filter((f) => validarFuente(f, base) === null) as Fuente[]) : []
}

// Carga las fuentes y pone la primera familia como cuerpo y títulos. Sin
// fuentes vuelve a las de la hoja. Una que no carga se omite.
export async function aplicarFuentes(fuentes: readonly Fuente[]): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return
  const estilo = document.documentElement.style
  const cargadas: string[] = []
  for (const f of fuentes) {
    try {
      const cara = new FontFace(f.familia, `url("${f.archivo}")`, { weight: String(f.peso) })
      document.fonts.add(await cara.load())
      cargadas.push(f.familia)
    } catch {
      // Se queda la fuente de la hoja; se avisa para no fallar en silencio
      console.warn('[tema] no se pudo cargar la fuente', f.familia, f.peso)
    }
  }
  for (const p of ['--pal-fuente-cuerpo', '--pal-fuente-display']) {
    if (cargadas.length) estilo.setProperty(p, `'${cargadas[0]}', ${RESPALDO}`)
    else estilo.removeProperty(p)
  }
}
