# erpnext: verificación 1

Verificación independiente de los cuatro informes `erpnext-modulos.md`, `erpnext-operaciones.md`, `erpnext-permisos.md` y `erpnext-automatizacion.md`. Se abrió cada archivo citado en la línea citada, en solo lectura, intentando refutar la afirmación. Rutas relativas a `C:\Users\enzov\IA\personal\investigacion-erp`; `E` = `erpnext/erpnext`, `F` = `frappe/frappe`.

Criterio: CONFIRMADO (la cita dice eso), CORREGIDO (la idea es cierta pero la cita o el detalle estaban mal; se da la cita buena), DESCARTADO (no se sostiene). Las filas `H` son la muestra de cinco hechos de «Cómo lo resuelve» (número de hecho del informe original).

## Totales

| Informe | Revisados | Confirmados | Corregidos | Descartados |
|---|---|---|---|---|
| erpnext-modulos | 22 | 17 | 5 | 0 |
| erpnext-operaciones | 23 | 18 | 5 | 0 |
| erpnext-permisos | 23 | 20 | 3 | 0 |
| erpnext-automatizacion | 25 | 21 | 4 | 0 |
| Total | 93 | 76 | 17 | 0 |

## erpnext-modulos.md

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 manifiesto con dependencias | CONFIRMADO | `E/hooks.py` sin `required_apps` (búsqueda vacía); `F/installer.py:312-315` | La app instala primero las requeridas; entre módulos no hay manifiesto. |
| A2 activar = marcar y ocultar | CONFIRMADO | `F/core/doctype/module_profile/module_profile.json:28-34`; `E/public/js/setup_wizard.js:92-98`; `E/setup/setup_wizard/setup_wizard.py:51-75` | Las casillas de módulos solo viajan a telemetría. El rango del asistente llega hasta la línea 98 (Proyectos). |
| A3 asistente por etapas y semillas de país | CORREGIDO | `E/setup/setup_wizard/setup_wizard.py:12-48`; `E/setup/setup_wizard/data/country_wise_tax.json:447-452` | Colombia trae un único impuesto "VAT" al 16 % (desactualizado; el IVA vigente es 19 %), sin retenciones ni UVT. Sí existe un plan de cuentas colombiano verificado: `E/accounts/doctype/account/chart_of_accounts/verified/co_plan_unico_de_cuentas.json`. |
| A4 perfiles de rol por puesto | CONFIRMADO | `E/setup/install.py:374-395` (reconciliación) y `:486-512` (DEFAULT_ROLE_PROFILES) | Idempotente: añade los roles que faltan y quita los que sobran. |
| A5 matriz de permisos con banderas | CONFIRMADO | `F/core/doctype/docperm/docperm.json:42-212` | Todas las banderas citadas existen (también `mask` y `select`). |
| A6 permlevel e if_owner | CORREGIDO | `F/core/doctype/docperm/docperm.json:66`; `F/permissions.py:292-345`; ejemplo bueno: `E/selling/doctype/customer/customer.json:588,596,605,853` | `lead.json:565-615` solo tiene filas de permiso con nivel 1; ningún campo de Lead está en nivel 1 (solo aparecen las líneas 566, 605 y 611), así que no sirve de ejemplo. Customer sí tiene campos en nivel 1. |
| A7 libro auxiliar inmutable | CORREGIDO | `E/stock/doctype/stock_ledger_entry/stock_ledger_entry.json:50-273`; `E/accounts/doctype/gl_entry/gl_entry.json:60-274`; `E/stock/doctype/bin/bin.json:37-166`; `E/controllers/stock_controller.py:192`; `E/controllers/selling_controller.py:859` | Cierto que cancelar marca `is_cancelled` y no borra, pero ERPNext hace UPDATE (`E/stock/stock_ledger.py:405-413` y reproceso en `:1505-1520`). «Solo inserción con políticas que prohíben UPDATE» exige otro mecanismo para anular y para recalcular saldos. |
| A8 cadena documental con mapeo | CONFIRMADO | `E/crm/doctype/lead/mapper.py:16-62`; `E/crm/doctype/opportunity/mapper.py:16-65`; `E/selling/doctype/customer/customer.json:186` | Lead a Customer y Opportunity a Quotation por mapa de campos más función de relleno. El mapa Lead a Opportunity empieza en `lead/mapper.py:66`. |
| A9 tercero único con roles | CORREGIDO | Contactos polimórficos: `E/crm/doctype/lead/lead.py:133-158` (no 113-147); `E/crm/doctype/opportunity/opportunity.json:115-137` | La cita respalda solo el vínculo dinámico de contacto y dirección y `opportunity_from` más `party_name`. ERPNext mantiene Customer y Supplier como DocTypes separados: el «tercero único con roles» es propuesta de Bash Logistics, no patrón de ERPNext. |
| A10 estados enviables y workflow | CONFIRMADO | `E/selling/doctype/quotation/quotation.json:1182`; `F/workflow/doctype/workflow/workflow.json:31-129`; `F/workflow/doctype/workflow_transition/workflow_transition.json:24-80` | `allow_self_approval` viene en 1 por defecto (`workflow_transition.json:64-69`). |
| A11 reglas de autorización por monto | CONFIRMADO | `E/setup/doctype/authorization_rule/authorization_rule.json:33-161` | Transacción, base, valor, rol o usuario aplicable y aprobador por rol o usuario. |
| A12 campos personalizados por módulo | CORREGIDO | `F/custom/doctype/custom_field/custom_field.py:335-365`; `E/setup/install.py:36-38` (no 35-37) | La línea 35 es `setup_repost_defaults`; las llamadas a custom fields son 36 (Print Settings), 37 (UTM Campaign) y 38 (Address y Contact). Definiciones con `insert_after` en `install.py:178-250`. |
| A13 navegación como datos | CONFIRMADO | `E/crm/sidebar/crm/crm.json:1-35`; `E/crm/workspace/crm/crm.json:3-38` | El workspace declara gráfico y tres tarjetas numéricas; los rangos citados son aproximados. |
| A14 onboarding por módulo | CONFIRMADO | `E/selling/module_onboarding/selling_onboarding/selling_onboarding.json`; `E/selling/onboarding_step/create_customer/create_customer.json:1-23` | Ocho pasos con `is_optional` (cotización y pedido opcionales; factura y pago obligatorios). |
| A15 etapa y probabilidad aparte del estado | CONFIRMADO | `E/crm/doctype/opportunity/opportunity.json:170-183,229-241`; tablas hijas en `:383` (lost_reasons) y `:451` (competitors) | `status`, `sales_stage` (default Prospecting) y `probability` son campos distintos. |
| A16 mínimo útil para una pyme | CONFIRMADO | `E/public/js/setup_wizard.js:94-98`; `selling_onboarding.json` | Es una decisión de orden apoyada en el onboarding (termina en factura y pago); la cita del asistente cubre 94-98 y no 94-97. |
| A17 cartera desde libro de pagos | CONFIRMADO | `E/accounts/doctype/payment_ledger_entry/payment_ledger_entry.json:33-161` | Campos `party`, `amount`, `against_voucher_*`, `due_date`, `delinked` presentes. |
| H1 un paquete, 21 módulos | CONFIRMADO | `E/modules.txt:1-21` | Lista exacta de 21. |
| H3 módulos solo por código | CONFIRMADO | `E/hooks.py:26-46` | Mapa `code_only_modules` tal como se describe. |
| H8 ganchos de permiso por registro | CONFIRMADO | `E/hooks.py:349-359,361-371`; `E/stock/doctype/company_restriction/company_restriction.py:14-34,85-93` | Incluye el comodín `"*"` (líneas 358 y 370). |
| H12 activar módulos es solo configuración | CONFIRMADO | `E/public/js/setup_wizard.js:92-98`; `E/setup/setup_wizard/setup_wizard.py:12-75` | Las respuestas solo van a `capture()`. |
| H19 localización por país | CONFIRMADO | `E/regional/` (australia, italy, south_africa, turkey, united_arab_emirates, united_states); `country_wise_tax.json:447` | Sin carpeta de Colombia. Nota: sí hay plan de cuentas colombiano (ver A3). |

## erpnext-operaciones.md

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 libro de solo inserción | CORREGIDO | `E/stock/doctype/stock_ledger_entry/stock_ledger_entry.json:155-226`; `E/stock/stock_ledger.py:259-277` (reverso con cantidad invertida) y `:405-413` (marca `is_cancelled`) | El informe dice que el libro «nunca se actualiza», pero `set_as_cancel` hace UPDATE y el reproceso reescribe `qty_after_transaction`, `valuation_rate` y `stock_value` de filas existentes (`stock_ledger.py:1505-1520`). Con `REVOKE UPDATE` hay que resolver cómo anular y reprocesar. |
| A2 saldo por producto y bodega como caché | CONFIRMADO | `E/stock/doctype/bin/bin.py:12-19,51-79,100-110`; `E/stock/stock_ledger.py:2444-2475` | `recalculate_values` reconstruye desde el libro. Ojo: el libro solo actualiza real, valor y tasa; pedido y reservado los actualizan otros documentos. |
| A3 proyección como cifra de reorden | CONFIRMADO | `bin.py:100-110`; `E/stock/reorder_item.py:59-61` | Incluye también `planned_qty` y reservas de producción. |
| A4 reglas de reabastecimiento en el producto | CONFIRMADO | `E/stock/doctype/item_reorder/item_reorder.json:10-16,53-61`; `E/stock/doctype/item/item.py:628-666` | Única por bodega y tipo; cantidad obligatoria si hay nivel. Los tipos del reorden son Purchase, Transfer, Material Issue, Manufacture. |
| A5 variantes con producto cartesiano | CONFIRMADO | `E/controllers/item_variant.py:429-445,572-580`; `E/stock/doctype/item/item.py:1077-1096` | Salta combinaciones existentes; bloqueo tras el primer movimiento. |
| A6 unidad de stock y factor congelado | CONFIRMADO | `E/buying/doctype/purchase_order_item/purchase_order_item.json:247,259,607`; `E/stock/doctype/item/item.py:1723-1786`; `E/setup/doctype/uom/uom.json:36,70` | Exacta, inversa e intermedia por categoría. |
| A7 estado derivado de porcentajes | CONFIRMADO | `E/controllers/status_updater.py:88-111` (mapa de Purchase Order); `E/stock/doctype/purchase_receipt/purchase_receipt.py:156-191` | La tabla se evalúa de la última a la primera (`status_updater.py:319-338`). |
| A8 tolerancia de sobrerrecepción | CONFIRMADO | `E/controllers/status_updater.py:537-565` | Valor global en Stock Settings y excepción por producto. |
| A9 aceptada y rechazada con bodega de rechazo | CONFIRMADO | `E/stock/doctype/purchase_receipt_item/purchase_receipt_item.json:224,250,507,519` | Campos de cantidad aceptada, rechazada y bodega de rechazo presentes. |
| A10 lote con vencimiento y cantidad derivada | CORREGIDO | `E/stock/doctype/batch/batch.json:49,62,90,100`; cantidad: `E/stock/doctype/batch/batch.py:275-330` (calcula desde el libro) | Además existe una columna de solo lectura `batch_qty` (`batch.json:163-167`) que se refresca con `recalculate_batch_qty` (`batch.py:171-191`). «Cantidad calculada y no guardada» es impreciso: es calculable pero también hay caché. |
| A11 interruptor de seguimiento con bloqueo | CONFIRMADO | `E/stock/doctype/item/item.json:469-471,527-529`; `E/stock/doctype/item/item.py:1231-1274` | Las descripciones de los campos dicen que no se pueden cambiar tras un movimiento. |
| A12 bodegas en árbol con grupos | CONFIRMADO | `E/stock/doctype/warehouse/warehouse.json:66,203,236`; `E/stock/doctype/warehouse/warehouse.py:145-167`; `E/stock/reorder_item.py:181-210` | La prohibición de mover contra un grupo está en `E/stock/doctype/stock_ledger_entry/stock_ledger_entry.py:105`; `warehouse.py:145-167` regula la conversión a grupo. |
| A13 movimiento único con propósito | CONFIRMADO | `E/stock/doctype/stock_entry_type/stock_entry_type.json:18-22` (13 propósitos); `E/stock/doctype/stock_entry_detail/stock_entry_detail.json:103,117` | Recuento de 13 verificado. |
| A14 ajuste por conteo con propósito | CONFIRMADO | `E/stock/doctype/stock_reconciliation/stock_reconciliation.json:57-62` | Opening Stock, Stock Reconciliation, Adjustment Entry. |
| A15 BOM simple con versión y recursión | CONFIRMADO | `E/manufacturing/doctype/bom/bom.json:109,162,174,187,323,373`; `E/manufacturing/doctype/bom/bom.py:959-993` | Control de recursión presente. |
| A16 orden de trabajo mínima | CONFIRMADO | `E/manufacturing/doctype/work_order/work_order.json:129,135,167,217,237,277,286`; `stock_entry_type.json:22` (Manufacture) | El estado real tiene más valores (Draft, Submitted, Stock Reserved, Closed, Cancelled...). |
| A17 mínimo de pedido validado al sumar líneas | CONFIRMADO | `E/stock/doctype/item/item.json:616`; `E/buying/doctype/purchase_order/purchase_order.py:319-345` | Suma `stock_qty` por producto y rechaza si queda por debajo. |
| A18 ubicación sugerida con capacidad | CONFIRMADO | `E/stock/doctype/putaway_rule/putaway_rule.json:26,41,55,71,92`; `E/stock/doctype/putaway_rule/putaway_rule.py:164-269` | Reparte entre reglas con espacio libre y avisa lo que no cabe. |
| H1 variantes en la misma tabla | CONFIRMADO | `E/stock/doctype/item/item.json:172,566,575,582`; `E/controllers/item_variant.py:572-580` | |
| H3 congelamiento tras el primer movimiento | CORREGIDO | `E/stock/doctype/item/item.py:1077-1096` y `:1231-1274` | La excepción permitida no es solo FIFO a promedio móvil: el código quita la restricción siempre que el valor nuevo sea «Moving Average» (`:1256-1257`). La cita `item_variant.py:25` es solo la clase de excepción; la regla está en otra parte. |
| H11 lotes y seriales con documento propio | CORREGIDO | `E/stock/doctype/batch/batch.py:171-191,275-330`; `E/stock/doctype/batch/batch.json:163` | «La cantidad por lote no es una columna» es falso: existe `batch_qty` de solo lectura (ver A10). El resto del hecho se sostiene. |
| H14 reabastecimiento por tarea programada | CORREGIDO | `E/stock/reorder_item.py:15-77,156-178,181-210`; `E/stock/doctype/item_reorder/item_reorder.json:59` | El tipo de solicitud en la tabla del producto es `Transfer`, no `Material Transfer` (este último es de `material_request.json:86`, que además lista Subcontracting y Customer Provided). La lógica de proyección y herencia desde plantilla es correcta. |
| H15 compra con porcentajes y línea recibida | CONFIRMADO | `E/buying/doctype/purchase_order/purchase_order.json:893-906,950,960`; `status_updater.py:88-111` | La lista de estados del informe omite To Pay y Delivered; no cambia la idea. |

## erpnext-permisos.md

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 separar rol y alcance de filas | CONFIRMADO | `F/permissions.py:237-289`; `F/core/doctype/user_permission/user_permission.json:23-90` | Roles y reglas de fila se combinan como dos ejes. |
| A2 applicable_for e is_default | CONFIRMADO | `F/core/doctype/user_permission/user_permission.py:36-82,113-135`; `user_permission.json:51-75` | |
| A3 modo estricto para vínculos vacíos | CONFIRMADO | `F/permissions.py:373-388`; `F/model/db_query.py:1244-1258` | Es un ajuste del sistema (`apply_strict_user_permissions`). |
| A4 compartir un registro (DocShare) | CONFIRMADO | `F/share.py:183-214`; `F/model/db_query.py:1216-1217`; `F/permissions.py:192-215` | Con usuario o `everyone`. |
| A5 permisos por campo con nivel | CONFIRMADO | `F/model/document.py:1587-1619,1676-1709`; `E/selling/doctype/customer/customer.json:583-606,852-857` | |
| A6 casilla enmascarar | CONFIRMADO | `F/model/utils/mask.py:21-57`; `F/model/document.py:1644-1674` | Teléfono con 3 caracteres visibles, correo con dominio, fechas XX-XX-XXXX. |
| A7 reglas de módulo que solo deniegan | CONFIRMADO | `F/permissions.py:491-508`; `E/crm/doctype/contract/contract.py:12,182-237,298-303` | El comentario del propio código dice que los controladores solo pueden negar. |
| A8 bitácora de cambios de permisos | CONFIRMADO | `F/core/doctype/permission_log/permission_log.py:42-105`; `F/core/doctype/custom_docperm/custom_docperm.py:49-50` | Se omite en instalación y migración (`permission_log.py:69-71`). |
| A9 historial por campo opt-in | CONFIRMADO | `F/core/doctype/version/version.py:53-63,110-124`; `F/model/document.py:2402-2427`; `F/core/doctype/docfield/docfield.json:414-420` | |
| A10 anotar suplantación y agente | CONFIRMADO | `F/core/doctype/version/version.py:40-51` | |
| A11 Access Log de exportaciones | CONFIRMADO | `F/core/doctype/access_log/access_log.py:13-84` (el archivo tiene 84 líneas, no 92); `F/utils/sqlite_document.py:19`; `F/core/doctype/data_export/exporter.py:47`; `F/contacts/doctype/contact/contact.py:286` | Solo registra exportaciones y descargas; «lecturas sensibles» sería ampliación de Bash Logistics. Purga a 30 días en `access_log.py:36-42`. |
| A12 cierre por periodo y fecha | CORREGIDO | `E/accounts/services/gl_validator.py:42-71` (periodo) y `:99-120` (fecha); `E/accounts/doctype/accounting_period/accounting_period.py:105-145`; `E/hooks.py:418-420` | «Ni al administrador» vale solo para la fecha congelada (`gl_validator.py:113-115` niega aunque sea Administrator). En el periodo cerrado con rol exento, Administrator tiene todos los roles (`F/permissions.py:565-566`) y por tanto pasa (`gl_validator.py:62-65`). |
| A13 aprobación sin autoaprobación | CONFIRMADO | `F/model/workflow.py:368-369`; `F/workflow/doctype/workflow_transition/workflow_transition.json:63-69` | La bandera `allow_self_approval` viene activa por defecto; hay que desactivarla por transición. Administrator siempre pasa. |
| A14 depurador de permisos | CONFIRMADO | `F/permissions.py:71-81,85-234`; `F/core/doctype/permission_inspector/permission_inspector.py:1-30` | |
| A15 perfiles de rol y roles automáticos | CORREGIDO | `F/core/doctype/role_profile/role_profile.py:40-44` (propaga a usuarios; no la línea 46); `F/permissions.py:34-41,556-590` | `role_profile.py:46` y `module_profile.py:37` son `get_permission_log_options`, no el agrupamiento. El rol automático de usuarios de escritorio se llama `Desk User` (`permissions.py:36`), no «System User». |
| A16 reglas de fila ligadas a la ficha de personal | CONFIRMADO | `E/setup/doctype/employee/employee.py:172-177,224-263` | Crea el usuario y retira permisos al desvincular. |
| A17 jerarquía como regla de fila | CONFIRMADO | `E/setup/doctype/employee/employee.py:535-585` | Con User Permission de Employee, esa regla estándar manda (`:575`). |
| A18 campo fijo y exento de reglas de fila | CONFIRMADO | `F/core/doctype/docfield/docfield.json:315-349` | `set_only_once`, `permlevel` e `ignore_user_permissions`. |
| H2 matriz DocPerm y ejemplo Customer | CONFIRMADO | `F/core/doctype/docperm/docperm.json:42-212`; `E/selling/doctype/customer/customer.json:821-862` | Sales User lee, escribe, crea y comparte; Sales Manager solo lee; Sales Master Manager borra, importa y exporta. |
| H4 evaluación en capas | CONFIRMADO | `F/permissions.py:237-289` y `:491-508` | Orden: controlador (solo niega), roles, if_owner, regla de fila. |
| H9 enmascarado | CONFIRMADO | `F/model/utils/mask.py:21-57`; `F/model/document.py:1644-1674` | Restaura el valor real al guardar. |
| H15 historial Version | CONFIRMADO | `F/model/document.py:2402-2427`; `E/selling/doctype/customer/customer.json:951`; `E/selling/doctype/sales_order/sales_order.json:1918` | |
| H20 perfiles de rol y de módulo | CORREGIDO | `F/core/doctype/role_profile/role_profile.py:40-44`; `F/core/doctype/permission_inspector/permission_inspector.py`; `F/permissions.py:71-83` | Las citas `role_profile.py:46` y `module_profile.py:37` no muestran el agrupamiento (son las opciones de bitácora). El Permission Inspector sí se sostiene. |

## erpnext-automatizacion.md

Rutas sin prefijo del informe original son relativas a `E`; las `[frappe]` a `F`.

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 máquina de estados de aprobación | CONFIRMADO | `F/workflow/doctype/workflow_transition/workflow_transition.json:24-80`; `F/model/workflow.py:75-111,368-369` | `allow_self_approval` viene activa por defecto en el esquema. |
| A2 condiciones como filtros estructurados | CORREGIDO | `F/automation_engine/conditions.py:32-81` | `evaluate_filter_tree` evalúa el árbol en memoria (Python); no compila a SQL. Compilarlo a SQL sería trabajo propio. Archivo bajo licencia MIT (`conditions.py:2`). |
| A3 estado derivado por reglas ordenadas | CONFIRMADO | `E/controllers/status_updater.py:26-61,274-340` | Recorre la lista invertida y gana la primera condición que se cumple. |
| A4 autorización por monto o descuento | CONFIRMADO | `E/setup/doctype/authorization_rule/authorization_rule.json:33-161`; `E/setup/doctype/authorization_control/authorization_control.py:164-248` | Se invoca al enviar Sales Order (`sales_order.py:586-588`). |
| A5 aprobación por correo con enlace firmado | CORREGIDO | `F/workflow/doctype/workflow_action/workflow_action.py:132-157` (apply_action), `:424-436` (parámetros firmados) | El enlace caduca solo si cambió el estado (`:155-156`, página «Link Expired»). Si solo cambió `modified`, muestra la confirmación con una alerta de cambio y permite continuar (`:150-153`). Para caducar por `updated_at` hay que implementarlo. |
| A6 bandeja de acciones pendientes | CONFIRMADO | `F/workflow/doctype/workflow_action/workflow_action.py:94-129` | Crea una acción por rol, completa las anteriores y encola el correo. |
| A7 motor único con cola outbox | CONFIRMADO | `F/automation/doctype/automation_flow/automation_flow.json:85-91`; `F/automation_engine/dispatch.py:34-50`; `F/automation_engine/drainer.py:242-282,318-327`; `F/automation_engine/settings.py:10-22` | Diez tipos de disparador, FOR UPDATE SKIP LOCKED, profundidad máxima 3. Código bajo licencia MIT. |
| A8 reglas de asignación | CONFIRMADO | `F/automation/doctype/assignment_rule/assignment_rule.py:83-210` | Rotativa con `for_update` (`:144`), carga, por campo y ponderada. |
| A9 notificaciones por evento y fecha relativa | CORREGIDO | `F/email/doctype/notification/notification.json:127-156`; `F/email/doctype/notification/notification.py:878-948`; vista previa `:133-170` | Solo el caso de campo faltante en «Value Change» desactiva la regla (`:920-924`). Los errores de plantilla y los demás se relanzan con `frappe.throw` (`:939-948`), no se aíslan por regla. Hay commit por documento (`:889-891`). |
| A10 plantillas de correo con vista previa | CONFIRMADO | `F/email/doctype/email_template/email_template.json:22-60`; `F/email/doctype/notification/notification.py:133-170` | |
| A11 documentos recurrentes | CONFIRMADO | `F/automation/doctype/auto_repeat/auto_repeat.py:587-628` | `create_repeated_entries` solo crea cuando la fecha programada es exactamente hoy (`:604`); un día perdido no se recupera. |
| A12 numeración consecutiva por plantilla | CONFIRMADO | `F/model/naming.py:346-407,428-452`; `F/core/doctype/document_naming_rule/document_naming_rule.py:56-70`; `E/accounts/utils.py:1716-1733`; `E/hooks.py:489-493` | `getseries` usa SELECT FOR UPDATE más UPDATE (y un INSERT ON CONFLICT solo para SQLite). |
| A13 informe programado por correo | CONFIRMADO | `F/email/doctype/auto_email_report/auto_email_report.json:79,144-147,174-186`; `.py:335-367` | Frecuencias Daily, Weekdays, Weekly, Monthly; formatos HTML, XLSX, CSV y PDF; `send_if_data`. |
| A14 estado de cuenta en PDF por lote | CONFIRMADO | `E/accounts/doctype/process_statement_of_accounts/process_statement_of_accounts.py:190-244,423-435,548-604` | Avanza el periodo tras cada envío programado. |
| A15 cobranza escalonada (Dunning) | CONFIRMADO | `E/accounts/doctype/dunning/dunning.py:75-85,113-131,322-333,585-608` | Nivel = envíos previos de esa cuota más uno; estado desde el saldo de cargo e interés. |
| A16 goteo con baja de suscripción | CONFIRMADO | `E/crm/doctype/email_campaign/email_campaign.py:87-93,132-173,272-288` | Solo envía cuando `inicio + N días` es hoy; un día sin ejecución omite el paso. |
| A17 SLA con festivos y pausa | CONFIRMADO | `E/support/doctype/service_level_agreement/service_level_agreement.py:523-581`; `E/hooks.py:525` | Job horario `fail_overdue_agreements`. |
| A18 indicadores como datos | CONFIRMADO | `F/desk/doctype/number_card/number_card.py:101-138,141-221` | Los permisos siguen los del tipo de documento (read). |
| A19 plantillas de impresión y PDF headless | CONFIRMADO | `F/printing/doctype/print_format/print_format.json:63-332`; `F/utils/pdf.py:91-128`; `F/email/doctype/notification/notification.py:779-796` | Hay también un generador ligero alternativo, PlutoPrint (`pdf.py:99-108`). |
| A20 informe preparado en segundo plano | CONFIRMADO | `F/core/doctype/prepared_report/prepared_report.py:123-250,327-357` | La caducidad de `:327` es de informes atascados; la purga de antiguos es `clear_old_logs` (`:57-62`, 30 días). |
| H4 separación de funciones | CONFIRMADO | `F/model/workflow.py:158-190,368-369` | Administrator también pasa. |
| H11 estado derivado con status_map | CONFIRMADO | `E/controllers/status_updater.py:26-60,274-340` | Ordenado de la última a la primera, gana la primera que se cumple. |
| H12 notificaciones por evento | CORREGIDO | `F/email/doctype/notification/notification.json:127-134`; `F/email/doctype/notification/notification.py:878-948`; `F/hooks.py:307-315` | Eventos y planificación correctos. Falso que «la evaluación aísla errores de plantilla»: se relanzan (ver A9). Solo desactiva la regla si falta el campo de «Value Change». |
| H14 motor Automation Flow | CONFIRMADO | `F/automation_engine/runner.py:204-221`; `F/automation_engine/scheduler.py:18-42`; `F/automation_engine/drainer.py:242-282`; `settings.py:10-22` | Modo de prueba con esperas simuladas (`runner.py:297-320`). |
| H16 tareas programadas | CONFIRMADO | `E/hooks.py:510-577`; `F/core/doctype/scheduled_job_type/scheduled_job_type.py:206-209` | Cola «long» si la frecuencia contiene Long o Maintenance. |
