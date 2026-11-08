import { useId } from 'react'
import InfoI from '../../components/InfoI'
import type { Role } from '../../types'

interface Props {
  value: Role[]
  onChange: (roles: Role[]) => void
  available: string[]
}

// Sin roles marcados = visible para cualquier usuario autenticado.
// La lista de roles viene de la tabla `roles` (la carga la pestaña padre).
// El gate también puede contener CLAVES DE PERMISO (app_<slug>/herr_<clave>):
// se pintan siempre, aunque no vengan en `available`, para que ningún valor
// del gate quede invisible e ineditable.
export default function RolesField({ value, onChange, available }: Props) {
  const idEtiqueta = useId()
  function toggle(role: Role) {
    onChange(
      value.includes(role) ? value.filter((r) => r !== role) : [...value, role]
    )
  }

  const visibles = [...available, ...value.filter((v) => !available.includes(v))]

  return (
    <div className="form-field">
      <span className="admin-etiqueta">
        <span className="form-label" id={idEtiqueta}>
          Visible para
        </span>
        <InfoI texto="Sin marcar ninguno, lo ve todo el equipo." />
      </span>
      <div className="chip-cloud" role="group" aria-labelledby={idEtiqueta}>
        {visibles.map((role) => {
          const on = value.includes(role)
          return (
            <button
              key={role}
              type="button"
              className="chipbtn"
              data-on={on ? '1' : '0'}
              aria-pressed={on}
              onClick={() => toggle(role)}
            >
              {role}
            </button>
          )
        })}
      </div>
    </div>
  )
}
