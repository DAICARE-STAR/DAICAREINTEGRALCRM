// Tipos del CRM nativo (PP-DEC-18). Solo forma de los datos: los datos de
// salud (PP-DEC-19) viven en otra tabla y no aparecen aquí.

export type TipoCuenta = 'persona' | 'empresa'
export type TipoActividad = 'nota' | 'llamada' | 'reunion' | 'correo' | 'visita'
export type EntidadCampo = 'cuenta' | 'contacto'
export type TipoCampo = 'texto' | 'numero' | 'fecha' | 'lista' | 'booleano'
export type Cierre = null | 'ganada' | 'perdida'

export type Cuenta = {
  id: string
  tipo: TipoCuenta
  nombre: string
  // Cédula (persona) o NIT (empresa)
  documento: string | null
  etapa: string | null
  origen: string | null
  // Solo para tipo 'empresa'
  tipo_empresa: string | null
  responsable_id: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  ciudad: string | null
  pais: string
  etiquetas: string[]
  campos: Record<string, unknown>
  notas: string | null
  archivado_en: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type Contacto = {
  id: string
  cuenta_id: string
  nombre: string
  relacion: string | null
  cargo: string | null
  email: string | null
  telefono: string | null
  principal: boolean
  etiquetas: string[]
  campos: Record<string, unknown>
  notas: string | null
  archivado_en: string | null
  created_at: string
  updated_at: string
}

export type Actividad = {
  id: string
  tipo: TipoActividad
  cuenta_id: string | null
  contacto_id: string | null
  fecha: string
  asunto: string
  detalle: string | null
  autor_id: string | null
  created_at: string
  updated_at: string
}

export const RE_CLAVE_CAMPO = /^[a-z][a-z0-9_]{1,40}$/

// La clave cumple RE_CLAVE_CAMPO
export type CampoDef = {
  clave: string
  entidad: EntidadCampo
  etiqueta: string
  tipo: TipoCampo
  opciones: string[]
  obligatorio: boolean
  filtrable: boolean
  orden: number
}

export type Etapa = {
  clave: string
  nombre: string
  orden: number
  cierre: Cierre
}

// Catálogos por instalación, en instalacion.ajustes.crm
export type AjustesCrm = {
  etapas: Etapa[]
  origenes: string[]
  tipos_empresa: string[]
  relaciones: string[]
}
