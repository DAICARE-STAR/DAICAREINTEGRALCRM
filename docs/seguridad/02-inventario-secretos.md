# 02 · Inventario de secretos por instalación

- Revisión: 2026-11-08 · Próxima: 2027-05-08
- Plantilla: se copia una vez por cliente en el gestor de contraseñas de quien instala, nunca en el repo. Las variables y su clase están en `docs/instalacion/variables.md`.

| Secreto | Dónde vive | Quién lo rota | Cuándo rotar | Efecto de rotar |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify del cliente y gestor | Quien instala | Salida de quien instala o sospecha | Redeploy de Netlify |
| `SUPABASE_DB_URL` (contraseña de la base) | Gestor de quien instala | Quien instala | Tras cada instalación o cambio de módulos | Ninguno en el sitio |
| `GEMINI_API_KEY` | Netlify del cliente | Quien instala | Sospecha o cambio de facturación | Redeploy |
| `SMTP_PASS` | Netlify del cliente | Responsable del correo | Política del proveedor | Redeploy |
| `VAPID_PRIVATE_KEY` | Netlify del cliente | Quien instala | Solo si se filtra | Invalida las suscripciones push |

## Reglas para agentes

- No pedir, repetir ni escribir ningún valor; nombrar solo la variable.
- Al cliente no se le entrega la cadena de conexión ni la clave de servicio (PP-DEC-11).
