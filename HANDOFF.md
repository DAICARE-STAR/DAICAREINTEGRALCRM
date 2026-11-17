# Handoff — TailorSuite

Estado vigente al 2026-11-17 (hora de Bogotá). Lo mantiene la sesión directora «TailorSuite»: se actualiza al cerrar cada fase u ola, antes de lanzar la siguiente. Sin secretos ni datos de personas.

## Qué es esta sesión

Directora: orquesta agentes de investigación, desarrollo y pruebas de TailorSuite. No toca el código del portal de origen; eso lo lleva la sesión «Portal hardening, productos y perfiles». Los informes de los agentes van a archivos, no al chat.

## Estado de los repos

| Repo | Carpeta | Estado |
|---|---|---|
| TailorSuite (producto) | `personal/portal-producto` | `main` en 0.2.16 (c06243b). En GitHub hasta 0.2.10. Sin subir: 0.2.11 a 0.2.16. `docs/analisis/` sin versionar. |
| CRM de DAI CARE | `clientes/daicare-crm` | En 0.2.16, ocho pasos sin subir. Su push publica en Netlify: solo con orden explícita. |
| Portal de origen | lo lleva su sesión | 1.12.49 (autocompletado cerrado, 6324fcd) y 1.12.50 publicados. Los ejemplos en gris del perfil siguen. |

## Pendientes heredados

- Base de DAI CARE (los corre el usuario): `npm.cmd run instalar` (aplica 06b), `node --env-file=.env tools/instalar/modulos.mjs --activar crm` (aplica 21b), `--verificar` y la simulación de permisos, que debe dar 96 OK. No consta el resultado.
- Push de `clientes\daicare-crm`: pendiente de orden.
- Push de TailorSuite 0.2.11 a 0.2.16: pendiente de orden.
- Antes de entregar a DAI CARE: Site URL y SMTP de Auth, borrar las cuentas de prueba, texto del consentimiento informado, sitio público y DNS.

## Plan en curso (aprobado el 2026-11-17)

Plan completo: `C:\Users\enzov\.claude\plans\en-la-repo-tailorsuite-peppy-lemon.md`.

| Frente | Qué | Estado |
|---|---|---|
| 0 | Handoff, memoria, commit | hecho (0.2.14 ef53c2c) |
| 2 | Perfil sin sugerencias ni ejemplos | hecho en el producto: 0.2.15 c1e34bf y 0.2.16 c06243b (ayudante campoPersona en src/lib/campos.ts, PP-DEC-20). Traído a clientes/daicare-crm por pull local, batería en verde (1265 pruebas). Falta: prueba del usuario en un Chrome real con autorrelleno guardado; si el teléfono o el correo aún sugieren, cambiar su type. Encargo al portal enviado el 2026-11-17, sin acuse: reenviar si su sesión no lo recoge. |
| 3 | Nombre nuevo | finalistas en docs/analisis/nombre-nuevo.md: Trenza (recomendado), Telar, Trama, Sovia, Medida. Espera la elección del usuario; luego WHOIS y SIC, y el renombre en código como paso propio. |
| 1 | Análisis de odoo, twenty, erpnext, monica y huly. Workflow `analisis-erp-crm` (script en la carpeta de workflows de la sesión, se relanza con args repos). Entregable en `docs/analisis/erp-crm-opensource/` | Hecho el 2026-11-17: fichas odoo, erpnext, twenty, monica y platform (117 propuestas, 777 citas verificadas, 91 corregidas, 2 descartadas), `comparativa.md` (decisiones D-1 a D-13) y `backlog.md` (73 BL; primer lote: BL-01, 02, 05, 06, 08, 10, 11, 12, 15, 16, 18, 20). Espera que el usuario decida D-1 a D-13 y apruebe el primer lote. Huecos comprobados: nueve módulos «disponible» sin archivo de esquema (10, 11, 13, 20, 22, 23, 26, 27, 28); sin guarda del último administrador; exportar el CRM no pide permiso propio. No se hizo el Artifact de resumen. |

## Reparto de modelos

Lectura masiva y verificación: Sonnet. Mecánico: Haiku. Síntesis, implementación y revisión: Opus. Fable solo en la directora. Reserva del 10 % semanal; se mide el consumo entre olas y, si el semanal pasa de 75 %, lo que falte espera al reinicio del 2026-11-21. Consumo al empezar: semanal 39 %, Fable 28 %. Tras los frentes 2 y 3 (12 agentes, 1,2 M de tokens): semanal 42 %. Ola 1 del frente 1 (23 agentes, 5,8 M de tokens): semanal 49 %, ventana de 5 horas 77 %. Ola 2 (26 agentes, 6,1 M) y síntesis hechas. Clones del frente 1 en personal/investigacion-erp (odoo parcial, erpnext, twenty, monica, platform).

## Reglas que no se olvidan

- No leer `.env`, ni las carpetas de respaldo y claves vetadas en las reglas personales. Las credenciales las teclea el usuario; el DDL lo corre él.
- Push a `main`, deploy y cualquier acción difícil de revertir: solo con orden explícita y confirmada aparte.
- Sin tareas programadas ni polling.
- Las áreas no se mezclan: nada del portal de origen en TailorSuite ni en los clientes. Datos de salud y de personas del cliente, nunca en el chat.
- Un archivo de esquema ya aplicado no se edita: las correcciones van en archivos con letra (06b, 21b).
- En PowerShell, `npm.cmd`. Los scripts con barras invertidas se escriben como archivo, no en heredoc.
