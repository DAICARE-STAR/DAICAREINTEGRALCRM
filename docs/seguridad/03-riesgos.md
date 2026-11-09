# 03 · Riesgos aceptados

- Revisión: 2026-11-08 · Próxima: 2027-05-08

| ID | Riesgo | Por qué se acepta | Qué lo reabriría |
|---|---|---|---|
| PP-R1 | Primera visita de un navegador con la paleta neutra un instante (PP-DEC-14) | No expone datos; evita un bloqueo de pintado | Queja de un cliente |
| PP-R2 | MFA opcional para los miembros | Decisión cerrada del sistema; la regla de segundo factor protege las funciones sensibles | Un incidente de cuenta o un requisito de cliente |
| PP-R4 | La clave de servicio (service role) puede leer Vault y por tanto descifrar `crm_salud` | Es inherente a Supabase: la clave de servicio equivale a acceso total a la base. Vive solo en Netlify y en el PC de quien instala, nunca en el navegador ni en el repo; si se expone, se rota en el panel de Supabase y en Netlify ese mismo día | Que Supabase permita restringir Vault a un rol distinto de la service role |
| PP-R5 | `crm_cambios` guarda antes y después de cada update de cuentas, contactos y actividades (datos personales, nunca salud) | Es el historial que pide el CRM. Se conserva mientras exista la entidad; al borrarla físicamente se suprime todo su historial y queda solo id, entidad y autor del borrado | Un plazo de retención pedido por el cliente o por la norma |
| PP-R3 | El trigger de límite de miembros es respaldo; la cuenta la hace `invitar-miembro` | Doble barrera, la de la base no se salta | Un alta fuera de la función |

## Reglas para agentes

- Un riesgo nuevo entra aquí con ID, motivo y condición de reapertura; nunca se acepta en silencio.
