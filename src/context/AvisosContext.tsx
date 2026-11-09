import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

// Avisos breves del shell: avisar(texto) los anuncia en una región role=status
// (cortés) y avisar(texto, 'error') en una role=alert (inmediata). Las dos
// regiones existen desde el montaje para que el lector las anuncie.

type Tipo = 'info' | 'error'
export type Avisar = (texto: string, tipo?: Tipo) => void

const AvisosContext = createContext<Avisar | null>(null)

const DURACION_MS = 5000

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null)

  const avisar = useCallback<Avisar>((texto, tipo = 'info') => {
    if (reloj.current) clearTimeout(reloj.current)
    setInfo(tipo === 'error' ? '' : texto)
    setError(tipo === 'error' ? texto : '')
    reloj.current = setTimeout(() => {
      setInfo('')
      setError('')
    }, DURACION_MS)
  }, [])

  return (
    <AvisosContext.Provider value={avisar}>
      {children}
      <div className="avisos">
        <div role="status" className={info ? 'aviso' : undefined}>
          {info}
        </div>
        <div role="alert" className={error ? 'aviso aviso-error' : undefined}>
          {error}
        </div>
      </div>
    </AvisosContext.Provider>
  )
}

export function useAvisos(): Avisar {
  const avisar = useContext(AvisosContext)
  if (!avisar) throw new Error('useAvisos fuera de AvisosProvider')
  return avisar
}
