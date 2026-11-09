import { useEffect, useState } from 'react'
import { SkeletonLineas } from '../../components/Skeleton'
import { cifraDestacada, filasDeModulos, type Consumo, type FilaBase, type FilaModulo } from '../../lib/consumo'
import { llamarProxy } from '../../lib/proxy'
import { supabase } from '../../lib/supabase'
import CabeceraAdmin from './CabeceraAdmin'

// Administración → Módulos (N-4), solo lectura y solo administrador: una
// fila por módulo del registro con estado, dependencias, conectores y
// límites con su consumo (modulos_consumo()). Sin acciones: la activación
// la hace el instalador (tools/instalar/modulos.mjs, PP-DEC-04).

const AYUDA = 'La activación de módulos y sus límites la hace el instalador con tools/instalar/modulos.mjs.'

const ESTADO: Record<FilaModulo['estado'], string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  planeado: 'Planeado',
  desconocido: 'Desconocido',
}

const ETIQUETA_LIMITE: Record<string, string> = {
  miembros: 'Miembros',
  almacenamiento_mb: 'Almacenamiento (MB)',
  retencion_uso_dias: 'Retención de uso (días)',
  ia_hora_miembro: 'IA por miembro y hora',
  ia_dia_equipo: 'IA del equipo por día',
}

const fmt = (n: number) => n.toLocaleString('es-CO')

// Estado que devuelve instalacion-estado-conectores (N-6); sin respuesta, «sin comprobar»
const ESTADO_CONECTOR: Record<string, string> = {
  configurado: 'configurado',
  sin_configurar: 'sin configurar',
  sin_comprobar: 'sin comprobar',
}
export const textoConector = (c: string, estados: Record<string, string> | null) =>
  `${c} (${ESTADO_CONECTOR[estados?.[c] ?? ''] ?? 'sin comprobar'})`

export function ModulosVista({ filas, conectores = null }: { filas: FilaModulo[]; conectores?: Record<string, string> | null }) {
  const destacada = cifraDestacada(filas)
  return (
    <>
      {destacada && (
        <p className="modulos-destacada">
          <strong className="modulos-cifra">{fmt(destacada.porcentaje)} %</strong>{' '}
          <span className="muted">
            consumo más alto: {ETIQUETA_LIMITE[destacada.clave] ?? destacada.clave} de {destacada.nombre}
          </span>
        </p>
      )}
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Módulo</th>
              <th scope="col">Estado</th>
              <th scope="col">Depende de</th>
              <th scope="col">Conectores</th>
              <th scope="col">Límites</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.slug}>
                <td>{f.nombre}</td>
                <td>{ESTADO[f.estado]}</td>
                <td>{f.depende.length ? f.depende.join(', ') : '—'}</td>
                <td>{f.conectores.length ? f.conectores.map((c) => textoConector(c, conectores)).join(', ') : '—'}</td>
                <td>
                  {f.limites.length === 0
                    ? '—'
                    : f.limites.map((l) => (
                        <div key={l.clave} className="small">
                          {ETIQUETA_LIMITE[l.clave] ?? l.clave}:{' '}
                          {l.limite === null
                            ? 'sin límite'
                            : l.usado === null
                              ? fmt(l.limite)
                              : `${fmt(l.usado)} de ${fmt(l.limite)} (${fmt(l.porcentaje ?? 0)} %)`}
                        </div>
                      ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function ModulosTab() {
  const [filas, setFilas] = useState<FilaModulo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conectores, setConectores] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    let vivo = true
    // Si el proxy no responde, los conectores quedan «sin comprobar»
    llamarProxy<{ conectores: Record<string, string> }>('instalacion-estado-conectores')
      .then((r) => vivo && setConectores(r.conectores))
      .catch(() => {})
    void (async () => {
      const [mods, consumo] = await Promise.all([
        supabase.from('modulos_instalacion').select('slug, activo, limites'),
        supabase.rpc('modulos_consumo'),
      ])
      if (!vivo) return
      if (mods.error) {
        setError('No se pudieron leer los módulos de la instalación.')
        setFilas([])
        return
      }
      // Sin consumo (RPC caída) los límites se listan sin cifra
      if (consumo.error) setError('No se pudo leer el consumo; los límites se muestran sin cifras.')
      setFilas(filasDeModulos((mods.data ?? []) as FilaBase[], consumo.error ? null : ((consumo.data ?? null) as Consumo | null)))
    })()
    return () => {
      vivo = false
    }
  }, [])

  return (
    <section>
      <CabeceraAdmin titulo="Módulos" ayuda={AYUDA} />
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {filas === null ? <SkeletonLineas n={6} /> : <ModulosVista filas={filas} conectores={conectores} />}
    </section>
  )
}
