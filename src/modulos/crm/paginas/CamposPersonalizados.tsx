import type { CampoDef, EntidadCampo } from '../lib/tipos'

// Controles de los campos propios de una entidad (crm_campos_def), con el
// error de validarCampos al lado de cada uno.
export default function CamposPersonalizados({
  defs,
  entidad,
  valores,
  errores,
  alCambiar,
}: {
  defs: CampoDef[]
  entidad: EntidadCampo
  valores: Record<string, unknown>
  errores: Record<string, string>
  alCambiar: (clave: string, valor: unknown) => void
}) {
  const propias = defs.filter((d) => d.entidad === entidad).sort((a, b) => a.orden - b.orden)
  if (propias.length === 0) return null
  return (
    <fieldset className="crm-form">
      <legend>Campos personalizados</legend>
      {propias.map((d) => {
        const v = valores[d.clave]
        const texto = v === undefined || v === null ? '' : String(v)
        const id = `crm-campo-${d.clave}`
        const err = errores[d.clave]
        const comunes = { id, 'aria-invalid': err ? true : undefined, required: d.obligatorio }
        let control
        switch (d.tipo) {
          case 'lista':
            control = (
              <select {...comunes} value={texto} onChange={(e) => alCambiar(d.clave, e.target.value)}>
                <option value="">—</option>
                {d.opciones.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )
            break
          case 'booleano':
            control = (
              <select {...comunes} value={v === true ? 'si' : v === false ? 'no' : ''} onChange={(e) => alCambiar(d.clave, e.target.value === '' ? '' : e.target.value === 'si')}>
                <option value="">—</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            )
            break
          case 'fecha':
            control = <input autoComplete="off" {...comunes} type="date" value={texto} onChange={(e) => alCambiar(d.clave, e.target.value)} />
            break
          case 'numero':
            control = <input autoComplete="off" {...comunes} inputMode="decimal" value={texto} onChange={(e) => alCambiar(d.clave, e.target.value)} />
            break
          default:
            control = <input autoComplete="off" {...comunes} maxLength={500} value={texto} onChange={(e) => alCambiar(d.clave, e.target.value)} />
        }
        return (
          <label key={d.clave} htmlFor={id}>
            <span>
              {d.etiqueta}
              {d.obligatorio ? ' *' : ''}
            </span>
            {control}
            {err && <span className="error small">{err}</span>}
          </label>
        )
      })}
    </fieldset>
  )
}
