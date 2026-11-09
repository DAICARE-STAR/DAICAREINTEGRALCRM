import { Route, Routes } from 'react-router'
import './crm.css'
import Contactos from './paginas/Contactos'
import Cuentas from './paginas/Cuentas'
import FichaContacto from './paginas/FichaContacto'
import FichaCuenta from './paginas/FichaCuenta'

// Rutas relativas a /crm/*
export default function RutasCrm() {
  return (
    <Routes>
      <Route index element={<Cuentas />} />
      <Route path="contactos" element={<Contactos />} />
      <Route path="cuentas/:id" element={<FichaCuenta />} />
      <Route path="contactos/:id" element={<FichaContacto />} />
    </Routes>
  )
}
