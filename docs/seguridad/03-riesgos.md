# 03 · Riesgos aceptados

- Revisión: 2026-11-08 · Próxima: 2027-05-08

| ID | Riesgo | Por qué se acepta | Qué lo reabriría |
|---|---|---|---|
| PP-R1 | Primera visita de un navegador con la paleta neutra un instante (PP-DEC-14) | No expone datos; evita un bloqueo de pintado | Queja de un cliente |
| PP-R2 | MFA opcional para los miembros | Decisión cerrada del sistema; la regla de segundo factor protege las funciones sensibles | Un incidente de cuenta o un requisito de cliente |
| PP-R3 | El trigger de límite de miembros es respaldo; la cuenta la hace `invitar-miembro` | Doble barrera, la de la base no se salta | Un alta fuera de la función |

## Reglas para agentes

- Un riesgo nuevo entra aquí con ID, motivo y condición de reapertura; nunca se acepta en silencio.
