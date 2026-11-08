import type { ComponentType, LazyExoticComponent } from 'react'

// Composición de lo que cada módulo aporta al shell. Cada módulo con
// pantalla trae src/modulos/<slug>/rutas.tsx, que exporta por defecto un
// ModuloShell: sus rutas perezosas (montadas en /<ruta>/*), los proveedores
// de búsqueda de Ctrl+K y las pestañas de Administración. Qué módulos
// existen, sus permisos y su ruta base siguen saliendo de src/lib/modulos.ts.
// Los módulos de negocio llegan con su fase: hoy ninguno trae rutas.tsx.

export interface ResultadoBusqueda {
  key: string
  title: string
  meta: string
  to: string
}

export interface ProveedorBusqueda {
  // Nombre del grupo en la paleta
  grupo: string
  // Longitud mínima del término
  minimo?: number
  buscar: (termino: string) => Promise<ResultadoBusqueda[]>
}

export interface PestanaAdmin {
  id: string
  label: string
  grupo: string
  // Permiso que la muestra, o 'admin'
  acceso: string
  Componente: LazyExoticComponent<ComponentType>
}

export interface ModuloShell {
  Rutas: LazyExoticComponent<ComponentType>
  busquedas?: ProveedorBusqueda[]
  pestanasAdmin?: PestanaAdmin[]
}

const archivos = import.meta.glob<{ default: ModuloShell }>('./*/rutas.tsx', { eager: true })

// slug → lo que aporta (la carpeta es el slug). Pura para probarla con un
// módulo que solo existe en las pruebas.
export function componerShell(mods: Record<string, { default: ModuloShell }>): Readonly<Record<string, ModuloShell>> {
  return Object.fromEntries(Object.entries(mods).map(([ruta, mod]) => [ruta.split('/')[1], mod.default]))
}

export const MODULOS_SHELL = componerShell(archivos)

export function shellDe(slug: string, shell: Readonly<Record<string, ModuloShell>> = MODULOS_SHELL): ModuloShell | undefined {
  return Object.prototype.hasOwnProperty.call(shell, slug) ? shell[slug] : undefined
}
