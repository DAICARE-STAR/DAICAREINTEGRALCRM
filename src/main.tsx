import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { InstalacionProvider } from './context/InstalacionContext'
import { iniciarTema } from './lib/theme'
// Tokens, temas y Roboto autoalojada (src/estilos); después, la hoja del shell
import './estilos/base.css'
import './styles.css'

// Aplica el tema guardado antes de pintar (evita parpadeo)
iniciarTema()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Sin transiciones, como en React Router 6: al abrir una página diferida
        se ve el LogoLoader del Suspense y la página anterior (p. ej. una app
        embebida que avisa su ventana) se desmonta de inmediato */}
    <BrowserRouter useTransitions={false}>
      <AuthProvider>
        <InstalacionProvider>
          <App />
        </InstalacionProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
