import { useCabeceraActiva, type DatosCabecera } from '../context/CabeceraContext'
import { CabeceraVista } from './CabeceraPagina'
import { Cargando, Skeleton } from './Skeleton'

// Cabecera fija del marco del shell (GUIA-UI, «Cabeceras»): primer hijo de
// main#contenido, no se desmonta al navegar y queda arriba con el scroll.
// Pinta la cabecera que registró la página; mientras no hay ninguna, la de
// respaldo de la ruta (título conocido) o un esqueleto de una línea.
export default function CabeceraMarco({ respaldo }: { respaldo: DatosCabecera | null }) {
  const datos = useCabeceraActiva() ?? respaldo
  return (
    <div className="cabecera-marco">
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
