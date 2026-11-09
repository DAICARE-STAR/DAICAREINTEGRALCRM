# 01 · Requisitos de seguridad

- Revisión: 2026-11-08 · Próxima: 2027-05-08
- Plantilla genérica para cada instalación. Rige además `C:\Users\enzov\IA\estandares\seguridad.md`.

> En resumen: una instalación por cliente, sin registro público, segundo factor disponible, RLS en toda tabla, funciones que fallan cerradas y secretos solo en Netlify y en el gestor de quien instala.

## Requisitos

1. Registro público cerrado en Supabase Auth; las cuentas entran por invitación (`invitar-miembro`).
2. TOTP activado en Auth; el segundo factor lo exige la regla de funciones, no un muro general (MFA opcional, decisión cerrada).
3. Toda tabla con RLS; las de módulo, además, con la política restrictiva `modulo_<slug>`.
4. Las funciones autentican, exigen permiso y módulo y validan el cuerpo con zod `.strict()` antes de tocar datos; sin lectura de la base responden 500 y no siguen.
5. Errores genéricos hacia el navegador; los logs no llevan tokens, contraseñas ni correos.
6. CSP del shell y cabeceras de `netlify.toml` sin relajar por instalación.
7. Ningún secreto en el repo: el escáner (`npm run secretos`) sale 0 antes de cada commit.

## Reglas para agentes

- Un requisito no se relaja para una instalación concreta; si un cliente lo pide, se registra como riesgo aceptado en `03-riesgos.md`.
