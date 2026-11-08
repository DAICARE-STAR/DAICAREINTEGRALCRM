import { useEffect, useState } from 'react'

// Pantalla angosta: el mismo corte que el CSS del cajón móvil (topbar y
// hamburguesa). Lo usan Layout y la campana de NotifBell.
const MOVIL = '(max-width: 760px)'

export function useEsMovil(): boolean {
  const [es, setEs] = useState(() => window.matchMedia(MOVIL).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOVIL)
    const alCambiar = () => setEs(mq.matches)
    alCambiar()
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [])
  return es
}
