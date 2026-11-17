# odoo — verificación 2

Verificación con contexto fresco de la sección «Adoptable para Bash Logistics» (A1…An) y de una muestra de 5 hechos de «Cómo lo resuelve» (H) de los informes `odoo-crm.md`, `odoo-finanzas.md`, `odoo-permisos.md` y `odoo-automatizacion.md`. Todas las rutas son relativas a `C:\Users\enzov\IA\personal\investigacion-erp\odoo`. Solo lectura; los informes originales no se tocaron. Veredictos: CONFIRMADO (la cita dice eso), CORREGIDO (la idea es cierta pero la cita o el detalle estaban mal) o DESCARTADO (no se sostiene).

## Resumen

| Informe | Revisados | Confirmados | Corregidos | Descartados |
|---|---|---|---|---|
| odoo-crm | 28 | 25 | 3 | 0 |
| odoo-finanzas | 23 | 22 | 1 | 0 |
| odoo-permisos | 25 | 24 | 1 | 0 |
| odoo-automatizacion | 25 | 24 | 1 | 0 |
| Total | 101 | 95 | 6 | 0 |

## odoo-crm

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 ganado/perdido derivado | CORREGIDO | `addons/crm/models/crm_lead.py:224-229, 562-570, 257-261` | La regla está en el cálculo de `won_status` (campo almacenado, 224-229) y en la restricción 257-261. El rango 905-914 es el docstring de `_handle_won_lost` (contadores de frecuencia), no la regla. Perdido es `active=False` y probabilidad 0; el motivo de pérdida no es obligatorio, así que «perdido = archivado con motivo» sobra. |
| A2 motivo de pérdida y nota de cierre | CONFIRMADO | `addons/crm/models/crm_lost_reason.py:7-25`; `addons/crm/wizard/crm_lead_lost.py:11-30` | Catálogo con `leads_count` y asistente que registra el comentario de cierre en el historial. |
| A3 etapas con is_won, fold, requirements, estancamiento, equipos | CONFIRMADO | `addons/crm/models/crm_stage.py:25-35` | Los cinco campos existen tal cual; `team_ids` es M2M. |
| A4 marca de estancada | CONFIRMADO | `addons/mail/models/mail_tracking_duration_mixin.py:60-125`; `addons/crm/models/crm_lead.py:379-387` | Aplica solo a `won_status='pending'` y `type='opportunity'`; usa `date_last_stage_update` y el umbral de la etapa (0 desactiva). |
| A5 tiempo por etapa en JSON | CONFIRMADO | `addons/mail/models/mail_tracking_duration_mixin.py:14-47` | `duration_tracking` es JSON almacenado con minutos por etapa. |
| A6 fechas de ciclo | CONFIRMADO | `addons/crm/models/crm_lead.py:155-164, 346-377, 777-792` | `date_open`, `day_open`, `day_close`, `date_closed` y `date_conversion` existen como se describe. |
| A7 prospecto con contacto propio y tercero diferido | CORREGIDO | `addons/crm/models/crm_lead.py:1950-1985, 1844-1858, 1320-1326, 1998` | La búsqueda por correo sin crear y la creación al convertir son ciertas. Pero la persona solo queda bajo una empresa si el lead ya tiene `partner_id`; el código dice expresamente que no crea la empresa aunque `partner_name` esté lleno (1998). |
| A8 duplicados por señales baratas | CONFIRMADO | `addons/crm/models/crm_lead.py:462-467, 574-628`; `addons/crm/tests/test_crm_lead_duplicates.py:20-28, 210-226` | Criterios y tope de 21 ciertos. La exclusión de dominios públicos sale de las pruebas: un correo de proveedor genérico devuelve el correo completo y uno corporativo solo `@dominio`. La función vive en `iap_tools`, fuera del clon. |
| A9 aviso de NIT repetido con archivados | CONFIRMADO | `odoo/addons/base/models/res_partner.py:546-573` | `active_test=False` y comentario sobre reactivar; solo partners sin padre. |
| A10 fusión con orden de confianza | CONFIRMADO | `addons/crm/models/crm_lead.py:1460-1503, 1590-1606, 1622-1649, 1923-1948` | Primer valor no nulo, descripción concatenada, prioridad máxima, etiquetas unidas, mensajes y actividades pasan a la cabeza con el asunto prefijado. |
| A11 fusión de cuentas con barandas | CONFIRMADO | `odoo/addons/base/wizard/base_partner_merge.py:454-518` | Máximo 3, no con el padre, mismo correo salvo administrador. El registro de quién fusionó es solo una línea de log del servidor (518), no una tabla. |
| A12 equipos y reparto rotativo | CONFIRMADO | `addons/crm/models/crm_team_member.py:14-56, 117-126`; `addons/crm/models/crm_lead.py:1860-1889` | 0 = fuera de rotación, tope 30000 = siempre; cuota diaria = capacidad/30 menos lo de 24 h; reparto en lote rotativo. |
| A13 lead sin vendedor cae al líder | CONFIRMADO | `addons/crm/models/crm_lead.py:1423-1433, 2105-2125` | Solo si no hay asignación por reglas activada y el lead tiene equipo; deja mensaje en el historial. |
| A14 reglas de fila de dos niveles | CONFIRMADO | `addons/crm/security/ir.access.csv:2-5` | Vendedor `cru` con `user_id = user.id` o vacío; «todos los leads» y gerente sin dominio. |
| A15 actividades polimórficas | CONFIRMADO | `addons/mail/models/mail_activity.py:59-175, 668-760`; `addons/mail/models/mail_activity_type.py:27-69` | `res_model`+`res_id`, estado calculado, feedback al historial, siguiente sugerida, retraso desde fecha previa o desde finalización. |
| A16 planes de actividad | CONFIRMADO | `addons/mail/models/mail_activity_plan.py:7-33`; `addons/mail/models/mail_activity_plan_template.py:16-66` | Pasos con tipo, intervalo, antes/después, usuario fijo, rol o «preguntar al lanzar». |
| A17 campos personalizados por equipo | CONFIRMADO | `addons/crm/models/crm_lead.py:117-119`; `addons/crm/models/crm_team.py:51` | `fields.Properties` con definición en `team_id.lead_properties_definition`. |
| A18 probabilidad doble | CONFIRMADO | `addons/crm/models/crm_lead.py:218-222, 502-517` | Se sincroniza mientras `probability == automated_probability` y estaba activo. |
| A19 puntaje predictivo | CONFIRMADO | `addons/crm/models/crm_lead.py:2174-2200, 2346, 2589-2601`; `addons/crm/models/crm_lead_scoring_frequency.py:7-16`; `addons/crm/data/crm_lead_prediction_data.xml:4-40` | Bayes ingenuo con +0,1, acotado a 0,01-99,99, variables configurables y cron de recálculo. |
| A20 cotización y pedido en un documento | CONFIRMADO | `addons/sale/models/sale_order.py:27-32, 551-558, 1114-1126, 1520-1527, 1623-1658, 1795-1803` | Estados, validez desde `company_id.quotation_validity_days`, `is_expired` buscable, reabrir limpia firma, no se cancela bloqueado. |
| A21 plantillas de cotización | CONFIRMADO | `addons/sale_management/models/sale_order_template.py:9-76` | Líneas, términos, días, firma, anticipo, correo y `team_ids`. |
| A22 estado de facturación calculado | CONFIRMADO | `addons/sale/models/sale_order.py:367-372, 876-917` | `no`, `to invoice`, `invoiced`, `upselling`. |
| A23 identificación DIAN | CONFIRMADO | `addons/l10n_co/models/res_partner.py:18-50`; `addons/l10n_co/tools/partner_identifiers.py:6-20` | NIT 31, CC 13, CE 22, pasaporte 41, PEP 47, PPT 48 y otros; no depende de módulos Enterprise. |
| H3 etapas por defecto | CONFIRMADO | `addons/crm/data/crm_stage_data.xml:3-20` | Nuevo, Calificado, Propuesta y Ganado (`is_won`, secuencia 70); no hay etapa Perdido. |
| H14 cliente a partir del lead | CORREGIDO | `addons/crm/models/crm_lead.py:1950-1986` | Búsqueda por correo sin crear: cierto. «Si hay nombre de contacto y empresa crea la persona hija de la empresa» solo vale cuando el lead ya tiene `partner_id`; no se crea empresa desde `partner_name` (1998). |
| H17 duplicados en la vista | CONFIRMADO | `addons/crm/models/crm_lead.py:574-628` | Tres criterios, tope de 21 en correo y teléfono (el criterio de misma entidad comercial no lleva tope), incluye archivados. |
| H23 reparto automático | CONFIRMADO | `addons/crm/data/ir_cron_data.xml:3-12`; `addons/crm/models/crm_team.py:188-209, 349` | Cron diario inactivo por defecto; `creation_delta_days=7`. |
| H24 puntuación PLS | CONFIRMADO | `addons/crm/data/crm_lead_prediction_data.xml:5-29`; `addons/crm/models/crm_lead.py:2195, 2346` | Variables por defecto: estado de teléfono y correo, departamento, país, fuente, idioma, etiquetas; +0,1 y tope 0,01-99,99. |

## odoo-finanzas

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 documento y asiento en un modelo | CONFIRMADO | `addons/account/models/account_move.py:138-166` | `move_type` con siete valores y estados draft/posted/cancel. |
| A2 CHECK en la línea contable | CONFIRMADO | `addons/account/models/account_move_line.py:548-563` | `credit*debit=0`, signo de `balance` y `amount_currency`, cuenta obligatoria y secciones sin importes. |
| A3 cuadre con consulta redondeada | CONFIRMADO | `addons/account/models/account_move.py:2945-2984` | La consulta no depende de campos calculados. Odoo la corre en `create` y `write` (4000, 4102), no en una función de publicar: es decisión de Bash Logistics hacerlo al publicar. |
| A4 cartera por cruces parciales | CONFIRMADO | `addons/account/models/account_partial_reconcile.py:12-62`; `addons/account/models/account_move_line.py:1161-1219` | El residual se recalcula restando cruces por línea. |
| A5 estado de pago derivado | CONFIRMADO | `addons/account/models/account_move.py:50-58, 1283-1376` | `in_payment` solo si hay pago o línea de extracto sin conciliar. |
| A6 pago delgado con cuenta puente | CONFIRMADO | `addons/account/models/account_payment.py:120-172, 430-445` | `outstanding_account_id` y `destination_account_id` (receivable o payable). |
| A7 nota crédito como reversa | CONFIRMADO | `addons/account/models/account_move.py:66-74, 652-660, 5921-5956` | La copia invierte el tipo y enlaza `reversed_entry_id`. |
| A8 impuestos y retenciones como filas con reparto | CONFIRMADO | `addons/account/models/account_tax.py:60-78, 121-160, 5204-5236` | Retenciones con tarifa negativa en `account.tax-co.csv:138, 154, 210`. |
| A9 plantilla colombiana como guía de siembra | CONFIRMADO | `addons/l10n_co/data/template/account.tax-co.csv:2, 138-141, 190-194, 210-214`; `account.tax.group-co.csv:1-46` | El CSV tiene 71 impuestos (las 269 filas incluyen filas de reparto). Incluye INC 4/8/16 % y autorretención de IVA. La advertencia de verificar tarifas es acertada. |
| A10 plan de cuentas jerárquico | CONFIRMADO | `addons/account/models/account_account.py:30, 34-38, 42, 66-92, 113, 134`; `addons/l10n_co/data/template/account.account-co.csv:1-4, 408, 513` | Restricción a 34-38 (no 33-37); `_parent_store` en 30. |
| A11 diarios por tipo con numeración | CONFIRMADO | `addons/account/models/account_journal.py:94-107, 169-179`; `addons/account/models/account_move.py:825-828, 3012-3018` | Índice único (nombre, diario) solo para publicados. |
| A12 fechas de bloqueo y excepciones | CONFIRMADO | `addons/account/models/company.py:60-105, 698-748`; `addons/account/models/account_lock_exception.py:11-82` | La comprobación de extractos sin conciliar aplica a la fecha global o definitiva; los borradores solo a la definitiva. |
| A13 no editar, solo revertir | CORREGIDO | `addons/account/models/account_move.py:4045-4051, 2069-2075, 4189-4219, 5962-5976` | Odoo bloquea la edición de nombre, fecha, diario y compañía solo cuando el asiento tiene `inalterable_hash` (diario con hash). Sin hash, un asiento publicado vuelve a borrador (2072-2075). `5968-5976` es `_can_be_unlinked` (predicado, junto con `unlink` en 4219). |
| A14 hash encadenado por diario | CONFIRMADO | `addons/account/models/account_move.py:361-363, 4721-4766, 4796-4817` | Cadena por diario y prefijo de secuencia, dentro del rango de fechas de la secuencia. |
| A15 condiciones de pago con cuotas | CONFIRMADO | `addons/account/models/account_payment_term.py:37-44, 169, 274-320` | Cuatro tipos de retraso, incluido «día fijo del mes siguiente». |
| A16 posición fiscal | CONFIRMADO | `addons/account/models/partner.py:33-80, 563-606` | Mapeo por país, grupo, departamento, rango postal y NIT requerido. `l10n_co` no trae posiciones fiscales precargadas; el uso para Colombia es una inferencia. |
| A17 identificación DIAN | CONFIRMADO | `addons/l10n_co/models/res_partner.py:18-50`; `addons/l10n_co/tools/partner_identifiers.py:6-20` | Código y número guardados por separado. |
| A18 matching number | CONFIRMADO | `addons/account/models/account_partial_reconcile.py:211-230`; `addons/account/models/account_move_line.py:357` | Número por componente conexo del grafo de cruces. |
| H4 `display_type` | CONFIRMADO | `addons/account/models/account_move_line.py:385-404` | Además de los valores citados hay tres de deducible parcial. |
| H8 extracto como asiento | CONFIRMADO | `addons/account/models/account_bank_statement_line.py:10-33` | `_inherits = {'account.move': 'move_id'}`. |
| H12 secuencias | CONFIRMADO | `addons/account/models/sequence_mixin.py:14-50`; `addons/account/models/account_move.py:825-832, 335` | Expresiones regulares sobre el nombre; `made_sequence_gap` e índice de huecos. |
| H15 diferencia de cambio | CONFIRMADO | `addons/account/models/account_move_line.py:3348`; `addons/account/models/company.py:132-147` | `_prepare_exchange_difference_move_vals` y cuentas de ganancia y pérdida en la compañía. |
| H20 configuración por plantilla | CONFIRMADO | `addons/l10n_co/models/template_co.py:15-62` | Cuentas por defecto correctas; las líneas reales son 15-45 y 47-62 (el informe cita 12-47 y 50-62). |

## odoo-permisos

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 permisos aditivos y restricciones globales | CONFIRMADO | `odoo/orm/models.py:3603-3647`; `odoo/addons/base/models/ir_access.py:64-93, 128-131` | `OR(permisos) & AND(restricciones)`; sin permisos el dominio es falso. |
| A2 jerarquía por implicación y excluyentes | CONFIRMADO | `odoo/addons/base/models/res_groups.py:75-135` | `disjoint_ids` es calculado y solo cubre los tipos de usuario (interno, portal, público). |
| A3 alcance con niveles | CONFIRMADO | `odoo/addons/base/models/res_groups_privilege.py:4-15`; `addons/purchase/security/purchase_security.xml:4-23`; `addons/hr/security/hr_security.xml:3-24` | El segundo nivel implica al primero. |
| A4 modelo completo y público | CONFIRMADO | `addons/hr/models/hr_employee_public.py:11-30`; `addons/hr/models/hr_employee.py:36-43, 161-176, 1549-1590` | Vista SQL (`_auto=False`) y campos privados con `groups="hr.group_hr_user"`. |
| A5 permiso por columna | CONFIRMADO | `odoo/orm/models.py:115, 2722-2734`; `odoo/orm/fields.py:129` | `NO_ACCESS = '.'` bloquea a todos salvo sudo. |
| A6 lista blanca de campos propios | CONFIRMADO | `odoo/addons/base/models/res_users.py:186-188, 650-660` | La excepción es `user_writeable`, superusuario o el grupo `group_erp_manager` (no solo administradores de sistema). |
| A7 heredar permiso del padre | CONFIRMADO | `odoo/orm/domains.py:1928-1967`; `addons/purchase/security/ir.access.csv:10`; `odoo/addons/base/models/ir_attachment.py:673-723` | En compras y ventas el operador `access` se usa en reglas de portal y de líneas contables; las líneas de usuario interno no llevan dominio. |
| A8 restricción de empresa con valor compartido | CONFIRMADO | `addons/crm/security/ir.access.csv:5`; `odoo/orm/models.py:3339-3352` | `company_id in company_ids + [False]`. |
| A9 reglas por estado | CONFIRMADO | `addons/hr_holidays/security/ir.access.csv:2-24` | Edita lo propio si el estado no es validate/validate1; borra solo en confirm y validate1. |
| A10 mis registros o todos | CONFIRMADO | `addons/crm/security/ir.access.csv:2-4`; `addons/sale/security/ir.access.csv:10-11` | Dos filas de permiso por rol. |
| A11 auditoría por campo | CONFIRMADO | `addons/mail/models/mail_track_mixin.py:29-32, 73-97, 133-170`; `addons/mail/models/mail_thread.py:526-536` | Valores iniciales con sudo y comparación al cierre; los mensajes de tracking no se editan. |
| A12 auditar los cambios de permisos | CONFIRMADO | `addons/mail/models/ir_access.py:5-12` | Rastrea solo `active`, `domain` y `operation`; Odoo no registra por separado altas y bajas. |
| A13 exportar como permiso aparte | CONFIRMADO | `odoo/addons/base/security/base_groups.xml:66-71`; `odoo/orm/models.py:937-938` | El chequeo vive en el método de exportación (no cubre la API directa, como dice el informe). |
| A14 reconfirmar contraseña a los 10 minutos | CONFIRMADO | `odoo/addons/base/models/res_users.py:97-137` | `identity-check-last` contra 10 minutos. |
| A15 claves de API | CONFIRMADO | `odoo/addons/base/models/res_users.py:1600-1650, 1668-1680, 1697-1705`; `odoo/addons/base/models/res_groups.py:40-41` | Prefijo de 8 hex, hash, vencimiento obligatorio salvo administrador y tope por grupo. |
| A16 fechas de bloqueo con excepciones | CONFIRMADO | `addons/account/models/company.py:60-105`; `addons/account/models/account_lock_exception.py:11-82` | Ver A12 de finanzas. |
| A17 hash encadenado | CONFIRMADO | `addons/account/models/account_move.py:4045-4051, 4721-4766` | Condicionado a diarios con hash. |
| A18 sesiones, dispositivos y borrado | CONFIRMADO | `odoo/addons/base/models/res_device.py:26-50, 358-371`; `odoo/addons/base/models/res_users_deletion.py:11-34`; `odoo/addons/base/security/ir.access.csv:136-139` | `user_id` entero por diseño. `revoked` significa que el archivo de sesión ya no existe; `revoke` exige reconfirmar identidad. El administrador solo tiene lectura sobre los registros de dispositivo. |
| A19 mensajes de denegación con roles | CONFIRMADO | `odoo/addons/base/models/ir_access.py:326-409` | Lista los grupos que permitirían la operación. |
| A20 personalizar sin perder la original | CONFIRMADO | `odoo/addons/base/models/ir_access.py:88-92, 261-276` | Desactiva la estándar y edita una copia. |
| H7 tipos de usuario como grupos base | CONFIRMADO | `odoo/addons/base/security/base_groups.xml:26-51, 81-96`; `odoo/addons/base/models/res_groups.py:402-410` | `group_system` implica `group_erp_manager`, que implica `group_user`; `group_everyone` implicado por los tres tipos. |
| H8 grupos como banderas | CONFIRMADO | `addons/sale/security/res_groups.xml:4-22`; `odoo/addons/base/security/base_groups.xml:53-59` | Descuento por línea, bloqueo de ventas, multiempresa y multimoneda. |
| H12 modelo público de empleados | CONFIRMADO | `addons/hr/models/hr_employee_public.py:11-30`; `addons/hr/security/ir.access.csv:2-8` | `access_hr_employee_public_user` da lectura a todo usuario interno. |
| H17 grupo multiempresa automático | CONFIRMADO | `odoo/addons/base/models/res_users.py:1437-1467` | Añade o quita `group_multi_company` según el número de empresas. |
| H23 segregación en contabilidad | CORREGIDO | `addons/account/security/account_security.xml:3-37` | No son niveles acumulativos «cada uno implicando al anterior»: el comentario del archivo dice que la jerarquía cambia según el módulo instalado (solo facturación: invoice y manager; con contabilidad: readonly, user y manager, sin que readonly implique a invoice). La casilla de pago saliente en cuentas bancarias de terceros no se comprobó en esta pasada. |

## odoo-automatizacion

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 motor disparador, condición y acciones | CONFIRMADO | `addons/base_automation/models/base_automation.py:129-190, 395-422` | 18 disparadores; los de «fijar valor» generan un dominio. La condición en JSON es propuesta de Bash Logistics. |
| A2 ejecución en el servidor | CONFIRMADO | `addons/base_automation/models/base_automation.py:844-880` | Parcha create y write; el equivalente con triggers es propuesta de Bash Logistics. |
| A3 evitar recursión con registro de ejecuciones | CONFIRMADO | `addons/base_automation/models/base_automation.py:759-823` | Mapa `__action_done` en el contexto y acciones con `sudo`. |
| A4 reglas por tiempo con `last_run` | CONFIRMADO | `addons/base_automation/models/base_automation.py:204-224, 1077-1202` | Ojo: si `last_run` es nulo usa el epoch 1970 (1092), así que la primera pasada de una regla nueva cubre todo el histórico; Bash Logistics debe inicializar `last_run` al crear la regla. |
| A5 tareas con lotes y autodesactivación | CONFIRMADO | `odoo/addons/base/models/ir_cron.py:37-39, 574-643, 872` | Se desactiva cuando se cumplen a la vez 5 fallos y 7 días; avisa al administrador. |
| A6 `FOR UPDATE SKIP LOCKED` | CONFIRMADO | `odoo/addons/base/models/ir_cron.py:362-369` | `FOR NO KEY UPDATE SKIP LOCKED`; el orden por fallos, prioridad e id está en 306. |
| A7 aprobación por umbral | CONFIRMADO | `addons/purchase/models/purchase_order.py:698-721, 1332-1341`; `addons/purchase/models/res_company.py:27-40` | El aprobador es el grupo gerente de compras fijo; «rol aprobador configurable» es adaptación. Umbral por defecto 5000. |
| A8 matriz de transiciones por rol | CONFIRMADO | `addons/hr_holidays/models/hr_leave.py:2497-2550` | En Odoo se comprueba en Python; el trigger en base es propuesta. |
| A9 estado corto más banderas | CONFIRMADO | `addons/sale/models/sale_order.py:26-31, 85-97, 1114-1126` | `locked` booleano e `is_expired` calculado y buscable. |
| A10 tiempo por etapa y estancamiento | CONFIRMADO | `addons/mail/models/mail_tracking_duration_mixin.py:14-48, 100-125`; `addons/crm/models/crm_stage.py:30` | Ver A4 y A5 de CRM. |
| A11 plan de actividades | CONFIRMADO | `addons/mail/models/mail_activity_plan.py:7-33`; `addons/mail/models/mail_activity_plan_template.py:16-66` | Responsable: al lanzar, usuario o rol. |
| A12 siguiente actividad sugerida | CONFIRMADO | `addons/mail/models/mail_activity_type.py:51-54, 65` | `suggested_next_type_id` y `mail_template_ids`. |
| A13 plantillas con marcadores simples | CONFIRMADO | `addons/mail/models/mail_render_mixin.py:291-309, 598-604, 637-655`; `addons/mail/models/ir_qweb.py:54-55` | Modo regex sin evaluar código con lista de expresiones permitidas por modelo; editor de plantillas para lo demás. |
| A14 validar plantilla al guardar | CONFIRMADO | `addons/mail/models/mail_template.py:218-243` | Renderiza contra el primer registro del modelo; si no hay registros no valida. |
| A15 cola de correo | CONFIRMADO | `addons/mail/models/mail_mail.py:79-107, 208-262` | Estados, tipos de fallo, reintento y lotes de 1000. El conteo de intentos no existe en Odoo. |
| A16 documento imprimible como dato | CONFIRMADO | `odoo/addons/base/models/ir_actions_report.py:37-72, 154-167`; `addons/sale/report/ir_actions_report.xml:9` | Adjunto reutilizable por nombre; que sea «inmutable» es propuesta. |
| A17 informes como vistas SQL | CONFIRMADO | `addons/sale/report/sale_report.py:12-16, 136-178`; `addons/crm/report/crm_activity_report.py:10-13, 84-94` | `_auto=False` y vista creada en `init()`. `security_invoker` es propuesta para Postgres. |
| A18 resumen periódico con KPI | CONFIRMADO | `addons/crm/models/digest.py:8-39` | KPI como campos booleanos por módulo con grupo requerido (`_raise_if_not_member_of`). |
| A19 numeración en dos modos | CONFIRMADO | `odoo/addons/base/models/ir_sequence.py:57-63, 129-152, 223-258, 277-287` | El modo sin huecos usa `FOR UPDATE NOWAIT`: falla de inmediato si otro lo tiene; en Postgres conviene decidir si se espera o se falla. |
| A20 asignar el número al publicar | CORREGIDO | `addons/account/models/account_move.py:998-1013`; `addons/account/models/sequence_mixin.py:427-438` | `_set_next_sequence` (427-451) no dice cuándo; lo que prueba «al publicar» es `_compute_name`, que solo asigna número si `state != 'draft'` (1012-1013). Ventas asigna al crear: `addons/sale/models/sale_order.py:1456-1469`. |
| H3 disparadores como dominio | CONFIRMADO | `addons/base_automation/models/base_automation.py:395-422` | Ver A1. |
| H10 una tarea para reglas por tiempo | CONFIRMADO | `addons/base_automation/models/base_automation.py:639-663, 704-719` | Intervalo entre 1 minuto y 4 horas con 10 % de holgura; solo se acorta (657), no se alarga salvo que no haya reglas por tiempo. |
| H12 sin reglas precargadas | CONFIRMADO | `addons/base_automation/data/base_automation_data.xml:1-12` | Solo el cron (inactivo, 4 horas). |
| H14 autodesactivación del cron | CONFIRMADO | `odoo/addons/base/models/ir_cron.py:37-39, 574-643` | Los dos umbrales deben cumplirse a la vez. |
| H36 numeración contable | CONFIRMADO | `addons/account/models/sequence_mixin.py:357-425` | Bloqueo vía índice único y savepoint con reintento; caché transaccional. |

## Observaciones fuera de la muestra

Estas inexactitudes están en secciones que no entraban en el alcance de la verificación; se dejan anotadas para que no se propaguen.

- odoo-crm, «Decisiones de diseño» 7 y «No conviene copiar» 4: citan `addons/crm/models/crm_lead.py:2300-2306` como el lugar donde el puntaje devuelve 0 si falta alguna de las dos clases. Esas líneas dicen otra cosa: devuelven 0 si el lead no tiene etapa y 100 si está en etapa ganada.
- odoo-automatizacion, «Decisiones de diseño» (marca de ejecución por regla): afirma que una regla nueva no dispara sobre el histórico. Con `last_run` nulo el código usa el epoch 1970 (`base_automation.py:1092`), así que dispara.
- odoo-finanzas, «Decisiones de diseño»: «269 filas de impuestos» son filas del CSV; los impuestos son 71 (`account.tax-co.csv`).
- odoo-finanzas hecho 13: la comprobación de extractos sin conciliar aplica también al bloqueo global, no solo al definitivo (`company.py:738-748`).
