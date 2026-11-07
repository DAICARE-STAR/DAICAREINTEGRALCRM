// Tema del portal. Los colores están en src/estilos/temas.css y la
// resolución del valor guardado en public/tema.js, que index.html carga sin
// defer para fijar data-theme (y las primitivas de la instalación en caché)
// antes de pintar. Este módulo solo expone esa lógica a React, para que no
// haya dos listas de temas que se puedan desincronizar.

export type Tema = 'claro' | 'calido' | 'oscuro'

export const TEMAS: readonly { id: Tema; nombre: string }[] = [
  { id: 'claro', nombre: 'Claro' },
  { id: 'calido', nombre: 'Cálido' },
  { id: 'oscuro', nombre: 'Oscuro' },
]

declare global {
  interface Window {
    ptLeerTema?: () => Tema
    ptAplicarTema?: (t: Tema) => void
    ptGuardarValores?: (valores: Record<string, string> | null) => void
  }
}

export const CLAVE_TEMA = 'pt_tema_v1'
export const CLAVE_VALORES = 'pt_tema_valores_v1'
const POR_DEFECTO: Tema = 'claro'

export function leerTema(): Tema {
  if (window.ptLeerTema) return window.ptLeerTema()
  // tema.js no cargó: el portal sigue usable con el tema por defecto
  return POR_DEFECTO
}

export function aplicarTema(tema: Tema): void {
  if (window.ptAplicarTema) {
    window.ptAplicarTema(tema)
    return
  }
  document.documentElement.setAttribute('data-theme', tema)
  try {
    localStorage.setItem(CLAVE_TEMA, tema)
  } catch {
    /* sin almacenamiento: el tema queda solo en esta sesión */
  }
}

// Caché local de las primitivas de la instalación (null la borra)
export function guardarValoresTema(valores: Record<string, string> | null): void {
  if (window.ptGuardarValores) window.ptGuardarValores(valores)
}

// Llamar una vez al arrancar la app, antes de pintar
export function iniciarTema(): void {
  document.documentElement.setAttribute('data-theme', leerTema())
}
