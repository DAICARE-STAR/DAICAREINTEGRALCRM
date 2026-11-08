import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { cabeceraActiva, quitar, registrar, type Registro } from '../lib/cabeceraMarco'

// Cabecera fija del marco del shell (GUIA-UI, «Cabeceras»): Layout pinta una
// sola cabecera arriba de main#contenido, que no se desmonta al navegar, y
// cada página la alimenta con <CabeceraPagina> (h1). Las secciones de
// Administración (nivel 2) no pasan por aquí: siguen en su sitio.
//
// Dos contextos: el del registro no cambia nunca (quien registra no se
// repinta cuando cambia la cabecera) y el de la activa solo lo lee el marco.

export interface DatosCabecera {
  titulo: ReactNode
  /** Icono del módulo (IconosNav o AppIcon); decorativo. */
  icono?: ReactNode
  ayuda?: string
  /** Ventana interna activa del visor de apps («— Subtareas»). */
  sufijo?: string | null
  pestanas?: ReactNode
  acciones?: ReactNode
}

interface Api {
  poner: (id: string, datos: DatosCabecera) => void
  quitar: (id: string) => void
}

const RegistroCtx = createContext<Api | null>(null)
const ActivaCtx = createContext<DatosCabecera | null>(null)

export function CabeceraProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Registro<DatosCabecera>[]>([])
  const api = useMemo<Api>(
    () => ({
      poner: (id, datos) => setLista((l) => registrar(l, id, datos)),
      quitar: (id) => setLista((l) => quitar(l, id)),
    }),
    []
  )
  return (
    <RegistroCtx.Provider value={api}>
      <ActivaCtx.Provider value={cabeceraActiva(lista)}>{children}</ActivaCtx.Provider>
    </RegistroCtx.Provider>
  )
}

/**
 * Registra la cabecera de la página en el marco (null = ninguna). Devuelve
 * false fuera del shell (sin CabeceraProvider): quien llama la pinta en su
 * sitio. Efectos de layout: el marco cambia antes de pintar, sin un cuadro
 * con el título de la página anterior.
 */
export function useCabecera(datos: DatosCabecera | null): boolean {
  const api = useContext(RegistroCtx)
  const id = useId()
  // Al desmontar se quita; mientras vive, cada render la actualiza en su sitio
  useLayoutEffect(() => {
    if (!api) return
    return () => api.quitar(id)
  }, [api, id])
  useLayoutEffect(() => {
    if (!api) return
    if (datos) api.poner(id, datos)
    else api.quitar(id)
  })
  return api !== null
}

/** La cabecera que pinta el marco ahora (null: ninguna página la registró). */
export function useCabeceraActiva(): DatosCabecera | null {
  return useContext(ActivaCtx)
}
