import { useRef, useState, type FormEvent } from 'react'
import Dialogo from '../../../components/Dialogo'
import { guardarActividad, traducirError } from '../lib/datos'
import type { Actividad, Contacto, TipoActividad } from '../lib/tipos'
import { TIPOS_ACTIVIDAD, textoNulo } from '../lib/vistas'

// datetime-local en hora de Bogotá (UTC−5, sin horario de verano)
function aLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 3600 * 1000)
  return d.toISOString().slice(0, 16)
}
const deLocal = (v: string) => new Date(v + ':00-05:00').toISOString()

export default function FormActividad({
  actividad,
  cuentaId,
  contactoId,
  contactos,
  onClose,
  onGuardada,
}: {
  actividad: Actividad | null
  cuentaId: string | null
  contactoId: string | null
  contactos: Contacto[]
  onClose: () => void
  onGuardada: (a: Actividad) => void
}) {
  const [f, setF] = useState(() => ({
    tipo: (actividad?.tipo ?? 'nota') as TipoActividad,
    fecha: aLocal(actividad?.fecha ?? new Date().toISOString()),
    asunto: actividad?.asunto ?? '',
    detalle: actividad?.detalle ?? '',
    contacto_id: actividad?.contacto_id ?? contactoId ?? '',
  }))
  const original = useRef(JSON.stringify(f))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const asuntoRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    try {
      onGuardada(
        await guardarActividad(actividad?.id ?? null, {
          tipo: f.tipo,
          cuenta_id: cuentaId,
          contacto_id: f.contacto_id || null,
          fecha: deLocal(f.fecha),
          asunto: f.asunto.trim(),
          detalle: textoNulo(f.detalle),
        }),
      )
    } catch (err) {
      setError(traducirError(err))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialogo
      titulo={actividad ? 'Editar actividad' : 'Nueva actividad'}
      onClose={onClose}
      onSubmit={enviar}
      sucio={() => JSON.stringify(f) !== original.current}
      focoInicial={asuntoRef}
    >
      <div className="crm-form">
        <label>
          <span>Tipo</span>
          <select value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>
            {TIPOS_ACTIVIDAD.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Asunto *</span>
          <input name="ts-crm-actividad-asunto" autoComplete="off" ref={asuntoRef} required maxLength={200} value={f.asunto} onChange={(e) => set('asunto', e.target.value)} />
        </label>
        <label>
          <span>Fecha</span>
          <input autoComplete="off" type="datetime-local" required value={f.fecha} onChange={(e) => set('fecha', e.target.value)} />
        </label>
        {cuentaId && contactos.length > 0 && (
          <label>
            <span>Contacto</span>
            <select value={f.contacto_id} onChange={(e) => set('contacto_id', e.target.value)}>
              <option value="">—</option>
              {contactos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>Detalle</span>
          <textarea name="ts-crm-actividad-detalle" autoComplete="off" rows={4} maxLength={4000} value={f.detalle} onChange={(e) => set('detalle', e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Dialogo>
  )
}
