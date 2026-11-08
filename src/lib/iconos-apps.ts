// Iconos propios de apps y herramientas. Mismo lenguaje que IconosNav:
// cuadrícula 24, trazo 2 redondeado, sin relleno, una tinta (currentColor),
// máximo 3 formas, coordenadas con un decimal como máximo, dibujo entre 2 y 22.
// La clave es el slug de la app o toolPermKey(nombre) de la herramienta.
// Selección aprobada el 2026-10-27 (hoja «Iconos de apps del portal»):
// 1B 2B 3A 4A 5A 6B 7A 8A 9B 10B 11A 12A 13B 14B 15A 16A 17A 18A 19A 20A 21A.

export type Forma =
  | { t: 'path'; d: string }
  | { t: 'circle'; cx: number; cy: number; r: number }
  | { t: 'rect'; x: number; y: number; width: number; height: number; rx?: number }

const p = (d: string): Forma => ({ t: 'path', d })
const c = (cx: number, cy: number, r: number): Forma => ({ t: 'circle', cx, cy, r })
const r = (x: number, y: number, width: number, height: number, rx?: number): Forma => ({
  t: 'rect',
  x,
  y,
  width,
  height,
  rx,
})

export const ICONOS_LINEA: Record<string, readonly Forma[]> = {
  // Apps
  'sitio-web': [r(3, 4, 18, 16, 2), p('M3 9H21'), p('M6.5 6.5H7M9.5 6.5H10')],
  proyectos: [
    p('M3 7A2 2 0 0 1 5 5H9.5L11.5 7.5H19A2 2 0 0 1 21 9.5V18A2 2 0 0 1 19 20H5A2 2 0 0 1 3 18Z'),
    c(12, 14, 2.5),
  ],
  cotizador: [
    p('M14 3H7A2 2 0 0 0 5 5V19A2 2 0 0 0 7 21H17A2 2 0 0 0 19 19V8Z'),
    p('M14 3V8H19'),
    p('M14.5 11H11A1.5 1.5 0 0 0 11 14H13A1.5 1.5 0 0 1 13 17H9.5M12 9.5V18.5'),
  ],
  licitaciones: [p('M21 12A9 9 0 1 1 12 3'), p('M16.5 12A4.5 4.5 0 1 1 12 7.5'), p('M12 12L18.5 5.5')],
  directorio: [r(3, 4, 18, 16, 2), c(9, 9, 2), p('M6 17A3 3 0 0 1 12 17M15 10H18M15 14H18')],
  productos: [p('M12 3L20 7.5V16.5L12 21L4 16.5V7.5Z'), p('M4 7.5L12 12L20 7.5'), p('M12 12V21')],
  gerencia: [p('M4 21V15H8V21M10 21V10H14V21M16 21V5H20V21'), p('M3 21H21')],
  manuales: [
    p('M12 6.5C10 5 7 4.5 3 5V19C7 18.5 10 19 12 20.5C14 19 17 18.5 21 19V5C17 4.5 14 5 12 6.5Z'),
    p('M12 6.5V20.5'),
  ],
  disenos: [c(12, 4.5, 1.5), p('M11 6L6 20M13 6L18 20'), p('M7.5 15.5A9 9 0 0 0 16.5 15.5')],

  // Herramientas
  herr_titan_mail: [
    p('M3 13H8L9.5 16H14.5L16 13H21'),
    p('M5.5 5.5L3 13V18A2 2 0 0 0 5 20H19A2 2 0 0 0 21 18V13L18.5 5.5A1.5 1.5 0 0 0 17 4.5H7A1.5 1.5 0 0 0 5.5 5.5Z'),
  ],
  herr_correo_threeline: [r(8, 6, 13, 12, 2), p('M8.5 8L14.5 12.5L20.5 8'), p('M3 8H5M3 12H5M3 16H5')],
  herr_portal_facturacion: [
    p('M5 3H19V21L16.5 19.5L14 21L12 19.5L10 21L7.5 19.5L5 21Z'),
    p('M9 8H15M9 12H15M9 16H12'),
  ],
  herr_crm_aec: [c(12, 12, 9), c(12, 10, 3), p('M6.5 18.5A6 6 0 0 1 17.5 18.5')],
  herr_workspace_aec: [p('M4 4H10V10H4Z M14 4H20V10H14Z M4 14H10V20H4Z M14 14H20V20H14Z')],
  herr_reluxnet: [
    c(12, 12, 9),
    p('M3 12H21'),
    p('M12 12Q6 13 7 18.5Q11 17 12 12ZM12 12Q18 13 17 18.5Q13 17 12 12Z'),
  ],
  herr_envia: [
    p('M14 17V5H3V17H5.5M9.5 17H15.5M14 8.5H18L21 12V17H19.5'),
    p('M9.5 17A2 2 0 1 1 5.5 17A2 2 0 1 1 9.5 17Z M19.5 17A2 2 0 1 1 15.5 17A2 2 0 1 1 19.5 17Z'),
  ],
  herr_spb: [c(12, 5.5, 2.5), p('M12 8V21M9 11H15'), p('M7 13H4A8 8 0 0 0 20 13H17')],
  herr_emcali: [p('M13 3L5 13.5H12L11 21L19 10.5H12Z')],
  herr_epm_proveedores: [p('M8 21L12 3L16 21'), p('M6 7H18M7.5 12H16.5')],
  herr_latamcompra: [
    p('M3 4H5.5L8 15.5H18L20.5 7.5H6.5'),
    p('M10.5 19A1.5 1.5 0 1 1 7.5 19A1.5 1.5 0 1 1 10.5 19Z M18.5 19A1.5 1.5 0 1 1 15.5 19A1.5 1.5 0 1 1 18.5 19Z'),
  ],
  herr_licitalab_peru: [p('M13 5L19 11L16 14L10 8Z'), p('M13 11L5 19'), p('M13 21H21')],
}

// Accesos de una marca que comparten el logo de su par (si su campo
// «Icono» no trae ya una imagen).
export const LOGO_DE_PAR: Record<string, string> = {
  herr_dhl_express: '/icons/dhl.svg',
  herr_ups_acceso: '/icons/ups.svg',
}

// El campo `icon` acepta una ruta interna a imagen o una URL https; los
// emoji heredados se ignoran.
export function esRutaImagen(icon: string): boolean {
  return icon.startsWith('/') || icon.startsWith('https://')
}

export type IconoResuelto =
  | { tipo: 'linea'; formas: readonly Forma[] }
  | { tipo: 'imagen'; src: string }
  | { tipo: 'anillos' }

// Solo claves propias: un slug como «constructor» o «tostring» no debe
// encontrar lo heredado de Object.prototype.
function propia<T>(mapa: Record<string, T>, clave: string | null | undefined): T | undefined {
  return clave && Object.prototype.hasOwnProperty.call(mapa, clave) ? mapa[clave] : undefined
}

// Junto al campo «Icono» de Administración, en las fichas con icono propio
export const AVISO_ICONO_PROPIO = 'Las apps y herramientas con icono propio del portal no usan este campo.'

export function tieneIconoPropio(clave: string | null | undefined): boolean {
  return propia(ICONOS_LINEA, clave) !== undefined
}

// Orden: icono propio > imagen del campo «Icono» > logo del par > anillos.
export function resolverIcono(clave: string | null | undefined, icon: string | null): IconoResuelto {
  const formas = propia(ICONOS_LINEA, clave)
  if (formas) return { tipo: 'linea', formas }
  const valor = (icon ?? '').trim()
  if (valor && esRutaImagen(valor)) return { tipo: 'imagen', src: valor }
  const par = propia(LOGO_DE_PAR, clave)
  if (par) return { tipo: 'imagen', src: par }
  return { tipo: 'anillos' }
}
