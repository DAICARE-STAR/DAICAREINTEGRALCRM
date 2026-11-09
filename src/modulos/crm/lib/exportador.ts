import { nombreEtapa } from './catalogos'
import { COLUMNAS, ENCABEZADOS, PREFIJO_EJEMPLO, type DatosCuenta } from './importador'
import type { AjustesCrm, CampoDef } from './tipos'

function camposCuenta(defs: CampoDef[]): CampoDef[] {
  return defs.filter(d => d.entidad === 'cuenta').sort((a, b) => a.orden - b.orden)
}

export function encabezados(defs: CampoDef[]): string[] {
  return [...COLUMNAS.map(c => ENCABEZADOS[c]), ...camposCuenta(defs).map(d => d.etiqueta)]
}

function textoCampo(def: CampoDef, v: unknown): string {
  if (v === null || v === undefined) return ''
  if (def.tipo === 'booleano') return v === true ? 'sí' : v === false ? 'no' : ''
  return String(v)
}

// `responsables`: id del perfil → correo (o nombre) que el importador sabe
// volver a traducir. La etapa se exporta por su nombre visible.
export function exportarCuentas(
  cuentas: DatosCuenta[],
  ajustes: AjustesCrm,
  defs: CampoDef[],
  responsables: Record<string, string>,
): string[][] {
  const propias = camposCuenta(defs)
  const filas = cuentas.map(c => [
    c.nombre,
    c.tipo,
    c.documento ?? '',
    c.etapa ? nombreEtapa(ajustes, c.etapa) : '',
    c.origen ?? '',
    c.tipo_empresa ?? '',
    c.responsable_id ? responsables[c.responsable_id] ?? '' : '',
    c.telefono ?? '',
    c.email ?? '',
    c.direccion ?? '',
    c.ciudad ?? '',
    c.pais,
    c.etiquetas.join('|'),
    c.notas ?? '',
    ...propias.map(d => textoCampo(d, c.campos[d.clave])),
  ])
  return [encabezados(defs), ...filas]
}

function ejemploCampo(def: CampoDef): string {
  switch (def.tipo) {
    case 'numero': return '1.234,5'
    case 'fecha': return '2026-01-31'
    case 'lista': return def.opciones[0] ?? ''
    case 'booleano': return 'sí'
    case 'texto': return 'texto'
  }
}

// Encabezados más una fila de ejemplo que el importador omite
export function plantilla(ajustes: AjustesCrm, defs: CampoDef[]): string[][] {
  const etapa = ajustes.etapas[0]?.nombre ?? ''
  return [
    encabezados(defs),
    [
      PREFIJO_EJEMPLO + 'María Pérez', 'persona', '1.020.304.050', etapa, ajustes.origenes[0] ?? '', '',
      '', '+57 300 123 4567', 'maria@ejemplo.com', 'Calle 1 # 2-3', 'Bogotá', 'CO', 'vip|nocturno', '',
      ...camposCuenta(defs).map(ejemploCampo),
    ],
  ]
}
