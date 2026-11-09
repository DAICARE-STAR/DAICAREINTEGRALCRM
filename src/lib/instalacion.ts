// Datos de la instalación que llegan por el entorno del build y logos de la
// tabla instalacion (N-4). El tema llega con N-5.

export const NOMBRE_PORTAL_POR_DEFECTO = 'TailorSuite'

export const NOMBRE_PORTAL: string = import.meta.env.VITE_PORTAL_NOMBRE?.trim() || NOMBRE_PORTAL_POR_DEFECTO

// Las 8 piezas de public/brand que una instalación puede reemplazar; sin
// logo propio se usa el archivo neutro.
export const LOGOS = {
  banner_440: { etiqueta: 'Logo del menú', archivo: '/brand/logo-banner-transp-440.png' },
  banner: { etiqueta: 'Logo grande', archivo: '/brand/logo-banner-transp.png' },
  icono: { etiqueta: 'Icono del menú compacto', archivo: '/brand/logo-icon.png' },
  favicon: { etiqueta: 'Favicon', archivo: '/brand/favicon-64.png' },
  icono_192: { etiqueta: 'Icono de la app (192)', archivo: '/brand/icon-192.png' },
  icono_maskable: { etiqueta: 'Icono adaptable (512)', archivo: '/brand/icon-maskable-512.png' },
  imagotipo: { etiqueta: 'Imagotipo', archivo: '/brand/imagotipo-512.png' },
  cuadrado: { etiqueta: 'Logotipo cuadrado', archivo: '/brand/logotipo-cuadrado.png' },
} as const
export type ClaveLogo = keyof typeof LOGOS
export const CLAVES_LOGO = Object.keys(LOGOS) as ClaveLogo[]
export type Logos = Partial<Record<ClaveLogo, string>>

// Prefijo público del bucket marca en el proyecto de Supabase
export const prefijoMarca = (base: string) => `${base.replace(/\/+$/, '')}/storage/v1/object/public/marca/`

// URL pública de un objeto del bucket marca, sin salirse de él
export function esUrlMarca(url: unknown, base: string): url is string {
  if (typeof url !== 'string' || !base) return false
  const prefijo = prefijoMarca(base)
  return url.startsWith(prefijo) && url.length > prefijo.length && !/\.\.|[\s"'<>\\]/.test(url.slice(prefijo.length))
}

// Solo claves de la lista con URL del bucket marca; lo demás se descarta
export function logosValidos(valor: unknown, base: string): Logos {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}
  const fuera: Logos = {}
  for (const clave of CLAVES_LOGO) {
    const url = (valor as Record<string, unknown>)[clave]
    if (esUrlMarca(url, base)) fuera[clave] = url
  }
  return fuera
}

export const logoDe = (logos: Logos, clave: ClaveLogo): string => logos[clave] ?? LOGOS[clave].archivo

// Caché local de los logos para Login, que se ve antes de iniciar sesión
// (instalacion solo la lee authenticated)
const CLAVE_LOGOS = 'pt_logos_v1'
export const SUPABASE_URL: string = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''

export function leerLogosCache(): Logos {
  try {
    return logosValidos(JSON.parse(localStorage.getItem(CLAVE_LOGOS) ?? 'null'), SUPABASE_URL)
  } catch {
    return {}
  }
}

export function guardarLogosCache(logos: Logos) {
  try {
    localStorage.setItem(CLAVE_LOGOS, JSON.stringify(logos))
  } catch {
    /* sin almacenamiento */
  }
}
