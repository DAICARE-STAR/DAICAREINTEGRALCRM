import CabeceraPagina from '../components/CabeceraPagina'
import { useTitulo } from '../lib/useTitulo'

// Ruta de un módulo que esta instalación no tiene activo, o que el usuario
// no puede ver. Con error de lectura de los módulos, el error y Reintentar.
export default function ModuloNoDisponible({
  nombre,
  error,
  alReintentar,
}: {
  nombre: string
  error?: string | null
  alReintentar?: () => void
}) {
  const titulo = `Módulo no disponible: ${nombre}`
  useTitulo(titulo)
  return (
    <div className="page">
      <CabeceraPagina titulo={titulo} />
      {error ? (
        <div role="alert">
          <p className="muted">{error}</p>
          {alReintentar && (
            <button type="button" className="btn-ghost btn-small" onClick={alReintentar}>
              Reintentar
            </button>
          )}
        </div>
      ) : (
        <p className="muted">Esta instalación no tiene activo el módulo o tu rol no lo incluye.</p>
      )}
    </div>
  )
}
