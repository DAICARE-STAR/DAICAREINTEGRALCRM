import React from 'react'
import ReactDOM from 'react-dom/client'
import { NOMBRE_PORTAL } from './lib/instalacion'

// Página mínima del arranque (fase 0.1): muestra el nombre de la instalación.
// El shell completo llega con el commit de origen (N-1).
function App() {
  return (
    <main>
      <h1>{NOMBRE_PORTAL}</h1>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
