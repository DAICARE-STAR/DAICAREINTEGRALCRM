import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { NOMBRE_PORTAL } from './lib/instalacion'
import { TEMAS, aplicarTema, iniciarTema, leerTema, type Tema } from './lib/theme'
import './estilos/base.css'

// Página mínima del arranque (fase 0.1): el nombre de la instalación en los
// tres temas. El shell completo llega con el commit de origen (N-1).
function App() {
  const [tema, setTema] = useState<Tema>(() => leerTema())
  const elegir = (t: Tema) => {
    aplicarTema(t)
    setTema(t)
  }
  return (
    <main style={{ display: 'grid', gap: 'var(--pal-esp-6)', padding: 'var(--pal-esp-6)', maxWidth: '40rem', margin: '0 auto' }}>
      <h1>{NOMBRE_PORTAL}</h1>
      <div role="group" aria-label="Tema" style={{ display: 'flex', gap: 'var(--pal-esp-2)', flexWrap: 'wrap' }}>
        {TEMAS.map((t) => (
          <button key={t.id} type="button" className="btn" aria-pressed={tema === t.id} onClick={() => elegir(t.id)}>
            {t.nombre}
          </button>
        ))}
      </div>
      <section className="card" aria-label="Muestra del tema" style={{ display: 'grid', gap: 'var(--pal-esp-3)' }}>
        <p style={{ margin: 0 }}>Texto principal</p>
        <p className="muted" style={{ margin: 0 }}>Texto secundario</p>
        <p className="acento" style={{ margin: 0 }}>Acento</p>
        <div>
          <button type="button" className="btn btn-primario">Acción primaria</button>
        </div>
      </section>
    </main>
  )
}

// Aplica el tema guardado antes de pintar (tema.js ya lo hizo; esto cubre el caso en que no cargó)
iniciarTema()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
