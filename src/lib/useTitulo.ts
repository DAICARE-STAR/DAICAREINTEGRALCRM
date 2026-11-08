import { useEffect } from 'react'
import { NOMBRE_PORTAL } from './instalacion'

// document.title por ruta y por ventana: «Inicio · Portal del equipo»,
// «Proyectos — Perdidos · Portal del equipo». Sin título se deja el de
// siempre (index.html y NotificationsContext).
//
// NotificationsContext escribe el título entero con el contador de no leídos
// («(3) Portal del equipo») cada vez que cambia. En vez de
// pelear por el orden de los efectos, se vigila el <title>: si alguien lo
// reescribe, se toma su contador y se recompone con el título de la ruta.

// Nombre de la instalación (VITE_PORTAL_NOMBRE)
const BASE = NOMBRE_PORTAL
const SUFIJO = NOMBRE_PORTAL

let tituloRuta: string | null = null
let contador = 0
let vigilante: MutationObserver | null = null

const contadorDe = (t: string) => Number(/^\((\d+)\)\s/.exec(t)?.[1] ?? 0)

function componer(): string {
  const t = tituloRuta ? `${tituloRuta} · ${SUFIJO}` : BASE
  return contador > 0 ? `(${contador}) ${t}` : t
}

function aplicar() {
  const t = componer()
  if (document.title !== t) document.title = t
}

function vigilar() {
  if (vigilante) return
  vigilante = new MutationObserver(() => {
    // Sin título de ruta, lo que escriban otros se respeta tal cual
    if (!tituloRuta || document.title === componer()) return
    contador = contadorDe(document.title)
    aplicar()
  })
  vigilante.observe(document.head, { subtree: true, childList: true, characterData: true })
}

export function useTitulo(titulo?: string | null) {
  useEffect(() => {
    if (!titulo) return
    vigilar()
    contador = contadorDe(document.title)
    tituloRuta = titulo
    aplicar()
    return () => {
      // Otra ruta pudo poner ya el suyo
      if (tituloRuta !== titulo) return
      tituloRuta = null
      aplicar()
    }
  }, [titulo])
}
