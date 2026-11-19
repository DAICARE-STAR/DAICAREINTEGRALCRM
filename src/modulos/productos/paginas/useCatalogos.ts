import { useCallback, useEffect, useState } from 'react'
import { useInstalacion } from '../../../context/InstalacionContext'
import { leerCatalogos, traducirError } from '../lib/datos'
import { CATALOGOS_VACIOS, type Catalogos } from '../lib/tipos'

/** Categorías, unidades y clases de impuesto, con la moneda base de la instalación. */
export function useCatalogos() {
  const { instalacion } = useInstalacion()
  const [catalogos, setCatalogos] = useState<Catalogos>(CATALOGOS_VACIOS)
  const [cargados, setCargados] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recargar = useCallback(
    () =>
      leerCatalogos().then(
        (c) => {
          setCatalogos(c)
          setCargados(true)
          setError(null)
        },
        (e) => setError(traducirError(e)),
      ),
    [],
  )
  useEffect(() => {
    void recargar()
  }, [recargar])
  return { catalogos, cargados, error, recargar, moneda: instalacion?.moneda_base ?? '' }
}
