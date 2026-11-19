import { Route, Routes } from 'react-router'
import './productos.css'
import Catalogos from './paginas/Catalogos'
import FichaProducto from './paginas/FichaProducto'
import Productos from './paginas/Productos'

// Rutas relativas a /productos/*
export default function RutasProductos() {
  return (
    <Routes>
      <Route index element={<Productos />} />
      <Route path="catalogos" element={<Catalogos />} />
      <Route path=":id" element={<FichaProducto />} />
    </Routes>
  )
}
