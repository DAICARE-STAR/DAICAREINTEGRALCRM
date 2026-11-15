import { useState } from 'react'

// Preferencia booleana de la persona en este navegador (menú compacto, barra
// de filtros plegada…), guardada como '1' o '0' en localStorage con clave
// pt_*_v1 (PP-DEC-05). Sin almacenamiento, vive solo en memoria.
export function usePreferenciaCompacta(clave: string): [boolean, () => void] {
  const [compacta, setCompacta] = useState(() => {
    try {
      return localStorage.getItem(clave) === '1'
    } catch {
      return false
    }
  })
  function alternar() {
    setCompacta((c) => {
      try {
        localStorage.setItem(clave, c ? '0' : '1')
      } catch {
        /* sin almacenamiento: solo estado en memoria */
      }
      return !c
    })
  }
  return [compacta, alternar]
}
