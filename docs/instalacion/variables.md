# Variables de entorno por instalación

Cada instalación (un cliente) tiene su `.env` local en el PC de quien instala y sus variables en el sitio Netlify del cliente. La plantilla es `.env.example`; aquí se dice dónde va cada una y qué conector la usa. Los valores nunca van al repo, al chat ni a un handoff.

| Variable | Clase | Dónde | Conector o uso |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Pública | Netlify y `.env` | Núcleo: cliente del navegador |
| `VITE_SUPABASE_ANON_KEY` | Pública | Netlify y `.env` | Núcleo: clave anónima (la RLS protege) |
| `VITE_VAPID_PUBLIC_KEY` | Pública | Netlify y `.env` | Avisos push: suscripción del navegador |
| `VAPID_PUBLIC_KEY` | Pública | Netlify | Avisos push: la misma clave para las funciones |
| `VITE_PORTAL_NOMBRE` | Pública | Netlify y `.env` | Nombre visible; vacío es «TailorSuite» |
| `SUPABASE_SERVICE_ROLE_KEY` | Secreta | Netlify y `.env` de quien instala | Funciones y `cuentas-prueba.mjs` |
| `SUPABASE_DB_URL` | Secreta | Solo el `.env` de quien instala | `aplicar.mjs`, `modulos.mjs`, `cuentas-prueba.mjs`; nunca en Netlify |
| `GEMINI_API_KEY` | Secreta | Netlify | Módulo IA (PP-DEC-03), con tope de gasto |
| `SMTP_PASS` | Secreta | Netlify | Conector correo |
| `VAPID_PRIVATE_KEY` | Secreta | Netlify | Avisos push; rotarla invalida las suscripciones |
| `CLAUDE_DEV_PASSWORD` | Secreta | Solo el `.env` del PC | Scripts locales de verificación |
| `SUPABASE_URL` | No sensible | Netlify y `.env` | Funciones |
| `URL` | No sensible | La define Netlify | Enlaces de invitación (`invitar-miembro`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` | No sensible | Netlify | Conector correo (465 TLS implícito; otro puerto exige STARTTLS) |
| `VAPID_SUBJECT` | No sensible | Netlify | Avisos push: `mailto:` del responsable |
| `GEMINI_MODEL`, `IA_MODELO_*` | No sensible | Netlify | Módulo IA: modelo global y por función |
| `CLAUDE_DEV_EMAIL` | No sensible | Solo el `.env` del PC | Cuenta de servicio de los scripts locales |
| `PORTAL_URL` | No sensible | Solo el `.env` del PC | `pruebas-autorizacion.mjs` (por defecto `http://localhost:5190`) |

## Reglas para agentes

- No leer `.env` ni pedir valores; solo nombrar la variable que falta.
- Una variable nueva entra en `.env.example` bajo su clase y en esta tabla; `entorno.test.ts` y `documentacion.test.ts` lo vigilan.
