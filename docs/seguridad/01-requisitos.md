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
8. Datos de salud del módulo `crm` (PP-DEC-19): base legal en la Ley 1581 de 2012 y el Decreto 1377 de 2013 (datos sensibles). Van cifrados con pgcrypto en `crm_salud` con la clave en Supabase Vault, sin grant para la API; solo se leen y escriben por `crm_salud_leer`, `crm_salud_guardar` y `crm_salud_borrar`, que exigen el permiso explícito `ver_salud` o `edit_salud` (un administrador no lo tiene por serlo), segundo factor (aal2) y registran cada acceso en `crm_accesos_salud`. Guardar exige el consentimiento informado `datos_salud` vigente en `crm_consentimientos`. Nada de salud en historial, auditoría, logs, búsqueda ni exportación.
9. Conservación y supresión en el `crm`: `crm_salud` y `crm_consentimientos` apuntan a la cuenta con `on delete restrict`. Una persona con datos de salud se borra solo después de `crm_salud_borrar` (administrador con `edit_salud` explícito, aal2, registrado); una cuenta con consentimientos no se borra físicamente, se archiva (el Decreto 1377 obliga a conservar la prueba de autorización). Nadie borra consentimientos por la API: se revocan (lo registra quien tenga `edit_crm`, `edit_salud` explícito o un administrador), con `revocado_en` y `revocado_por` sellados, y no se des-revocan. El vigente es el último por `created_at` (hora del servidor). Al borrar físicamente una cuenta, contacto o actividad se suprimen sus filas de `crm_cambios` y `crm_vinculos_externos` y queda solo una fila de borrado con id, entidad y autor (Ley 1581, art. 8). Los archivos de consentimiento van en `crm-consentimientos/<cuenta_id>/<archivo>`; los lee quien tenga `edit_crm` o `ver_salud` explícito, los sube `edit_crm` y solo un administrador los borra.
10. Supabase Vault: el esquema `vault` no se expone a la API (no figura en «Exposed schemas») y `anon` y `authenticated` no tienen select sobre `vault.secrets` ni `vault.decrypted_secrets` (lo comprueba la verificación de `21-crm.sql`).
11. PostgREST no admite `Prefer: tx=rollback`: `db-tx-end` no debe estar en un valor `*-allow-override`. Con la anulación permitida, una lectura de salud se desharía junto con su fila de `crm_accesos_salud` y no quedaría registro.

## Reglas para agentes

- Un requisito no se relaja para una instalación concreta; si un cliente lo pide, se registra como riesgo aceptado en `03-riesgos.md`.
