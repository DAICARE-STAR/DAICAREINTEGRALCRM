import { Component, type ErrorInfo, type ReactNode } from 'react'

// Un error al pintar un widget lo quita del Inicio en vez de tumbar la
// página entera. Los errores de datos y de permisos no pasan por aquí:
// los fetchers devuelven null y el widget se oculta solo, como siempre.
export default class WidgetBoundary extends Component<
  { id: string; children: ReactNode },
  { roto: boolean }
> {
  state = { roto: false }

  static getDerivedStateFromError(): { roto: boolean } {
    return { roto: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[widget ${this.props.id}]`, error, info.componentStack)
  }

  render(): ReactNode {
    return this.state.roto ? null : this.props.children
  }
}
