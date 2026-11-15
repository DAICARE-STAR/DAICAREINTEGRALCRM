import { useEffect, useLayoutEffect, useRef } from 'react'
import { useCabeceraActiva, type DatosCabecera } from '../context/CabeceraContext'
import { CabeceraVista } from './CabeceraPagina'
import { Cargando, Skeleton } from './Skeleton'

// Cabecera fija del marco del shell (GUIA-UI, «Cabeceras»): primer hijo de
// main#contenido, no se desmonta al navegar y queda arriba con el scroll.
// Pinta la cabecera que registró la página; mientras no hay ninguna, la de
// respaldo de la ruta (título conocido) o un esqueleto de una línea.
export default function CabeceraMarco({ respaldo }: { respaldo: DatosCabecera | null }) {
  const datos = useCabeceraActiva() ?? respaldo
  const ref = useRef<HTMLDivElement>(null)
  const alto = useRef(0)

  // Publica el alto real (crece con las pestañas) en --alto-cabecera-actual:
  // lo usan scroll-padding-top, el alto de Chat y del visor de apps y las
  // barras que se pegan debajo (.barra-fija, .admin-menu). Se mide al pintar
  // cada cabecera y, con ResizeObserver, cuando el ancho la hace saltar de
  // línea; solo se escribe si cambió. Sin JS queda el alto de una fila
  const medir = () => {
    const h = ref.current?.offsetHeight ?? 0
    if (h === alto.current) return
    alto.current = h
    document.documentElement.style.setProperty('--alto-cabecera-actual', `${h}px`)
  }
  useLayoutEffect(medir)
  useEffect(() => {
    const el = ref.current
    const obs = el && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    if (el) obs?.observe(el)
    return () => {
      obs?.disconnect()
      document.documentElement.style.removeProperty('--alto-cabecera-actual')
    }
  }, [])

  return (
    <div className="cabecera-marco" ref={ref}>
      {datos ? (
        <CabeceraVista
          titulo={datos.titulo}
          icono={datos.icono}
          ayuda={datos.ayuda}
          sufijo={datos.sufijo}
          pestanas={datos.pestanas}
        >
          {datos.acciones}
        </CabeceraVista>
      ) : (
        <div className="cabecera-fila">
          <Cargando etiqueta="Cargando la página" anunciar={false} className="cabecera-esqueleto">
            <Skeleton variante="titulo" />
          </Cargando>
        </div>
      )}
    </div>
  )
}
