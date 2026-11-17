# erpnext: verificación 2 (segunda pasada independiente)

Verificador con contexto fresco. Se abrió cada archivo citado en los elementos de «Adoptable para Bash Logistics» de los cuatro informes (crm, finanzas, extensibilidad, integración) y en una muestra de hechos de «Cómo lo resuelve», intentando refutarlos. Solo lectura; los informes originales no se tocaron.

Convención de rutas: `erpnext/erpnext/...` es el paquete ERPNext del clon `investigacion-erp\erpnext`; `frappe/frappe/...` es el framework clonado aparte. El informe de finanzas escribía `erpnext/accounts/...` sin el segundo `erpnext/`; aquí se normaliza. Dentro de una tabla, una ruta que empieza por un nombre de archivo suelto o por `accounts/` es relativa a la ruta completa ya citada en la misma fila o en el informe.

Veredictos: CONFIRMADO (la cita dice eso), CORREGIDO (la idea es cierta pero la cita o el detalle estaban mal; se da la cita buena), DESCARTADO (no se sostiene; ante la duda). Ningún elemento llegó a DESCARTADO: todos los defectos encontrados eran de detalle y la idea de fondo se sostiene.

## Totales

| Informe | Revisados | Confirmados | Corregidos | Descartados |
|---|---|---|---|---|
| erpnext-crm | 26 | 23 | 3 | 0 |
| erpnext-finanzas | 27 | 24 | 3 | 0 |
| erpnext-extensibilidad | 24 | 21 | 3 | 0 |
| erpnext-integracion | 23 | 21 | 2 | 0 |
| Total | 100 | 89 | 11 | 0 |

Correcciones que cambian una decisión de diseño (leer antes de usar los informes):

1. finanzas A12 y hecho 16: el PUC simple de Colombia SÍ trae tipos semánticos (Payable, Tax, Income Account, Cost of Goods Sold, Equity). No hay que «añadir tipos» de pagar, IVA ni retenciones; la afirmación contraria del informe es falsa.
2. extensibilidad A7: ERPNext sanea las vistas guardadas solo al guardarlas, no al cargarlas; no protege de un campo borrado después. Esa garantía habría que construirla en Bash Logistics.
3. extensibilidad A10: el campo agrupador de un Kanban debe ser de tipo Select; Link no es válido como campo principal.
4. integración A12: el cursor IMAP por carpeta no «se queda atrás» del correo fallido si un correo posterior del mismo lote sí se procesa.
5. crm A10: la cotización vencida la marca un trabajo programado diario, no el mapa de estados; la cita de `status_updater.py:53-61` es de Supplier Quotation.

## erpnext-crm

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 estado del Lead derivado | CONFIRMADO | `erpnext/erpnext/controllers/status_updater.py:26-33,319-338`; `erpnext/erpnext/crm/doctype/lead/lead.py:101-103` | Se evalúa el mapa invertido y `Do Not Contact` sale antes de recalcular. |
| A2 oportunidad bloqueada por cotizaciones | CONFIRMADO | `erpnext/erpnext/crm/doctype/opportunity/opportunity.py:190-224` | Lost con cotización activa y Quotation/Converted no coincidente lanzan error. |
| A3 conversión idempotente con trazas | CONFIRMADO | `erpnext/erpnext/selling/doctype/customer/customer.json:186,566,676`; `customer.py:226-237,478-491` | `lead_name`, `opportunity_name`, `prospect_name` y `DuplicateEntryError`. |
| A4 cuenta única evita reapuntar | CONFIRMADO | `erpnext/erpnext/selling/doctype/customer/customer.py:404-429` | El reapuntado de `quotation_to`/`opportunity_from` y `party_name` existe tal cual. |
| A5 motivos de pérdida | CONFIRMADO | `erpnext/erpnext/crm/doctype/opportunity/opportunity.py:219-224,369-392`; `opportunity_lost_reason.json:4,14-17` | Motivo obligatorio, competidores, detalle y `lost_on`. |
| A6 ajustes de CRM por instalación | CONFIRMADO | `erpnext/erpnext/crm/doctype/crm_settings/crm_settings.json:43,54,60,72` | Vigencia, duplicados por correo, contacto automático, autocierre. |
| A7 alerta de duplicados | CONFIRMADO | `erpnext/erpnext/crm/doctype/lead/lead.py:179-196,389-405`; `erpnext/erpnext/crm/doctype/utils.py:74-84` | Matiz: la búsqueda por teléfono (últimos dígitos) solo la usa Call Log; en la alta solo se valida el correo. La idea combinada es de Bash Logistics. |
| A8 fusión con reapuntado | CONFIRMADO | `frappe/frappe/model/rename_doc.py:108-130,195-210` | `merge=True`, comentario «merged X into Y» y borrado del origen. |
| A9 cotización con revisiones | CONFIRMADO | `erpnext/erpnext/selling/doctype/quotation/quotation.py:139-150,210-251,429-434`; `quotation.json:222,234,279` | Nombre `-R<n>`, una sola activa, no revisar una perdida. |
| A10 vigencia y estado vencida | CORREGIDO | `erpnext/erpnext/selling/doctype/quotation/quotation.py:197-204` (vigencia por defecto, correcto) y `:620-649` (`set_expired_status`), programado en `erpnext/erpnext/hooks.py:558` | La cita de `status_updater.py:53-61` es de Supplier Quotation. En Quotation «Expired» es una opción del campo (`quotation.json:889`) que fija un trabajo programado, no el mapa de estados. |
| A11 actividades abiertas e historial | CONFIRMADO | `erpnext/erpnext/crm/utils.py:177-255`; `opportunity.py:116-125` | Arrastra tareas y eventos abiertos al crear la oportunidad desde un Lead. |
| A12 reapertura y autocierre | CONFIRMADO | `erpnext/erpnext/crm/utils.py:7-8,264-287`; `opportunity.py:577-591`; `hooks.py:542,568` | Solo cierra los `Replied` inactivos; reabre solo desde estados de espera. |
| A13 asignación round robin y por carga | CONFIRMADO | `frappe/frappe/automation/doctype/assignment_rule/assignment_rule.py:39,125-178` | Round robin con `for_update`; carga por conteo de ToDo abiertas. |
| A14 equipo de ventas con reparto | CONFIRMADO | `erpnext/erpnext/selling/doctype/sales_team/sales_team.json:19,45,69,77`; `erpnext/erpnext/controllers/selling_controller.py:293-318`; `sales_person.py:20,44` | El 100 % se exige en el controlador; Sales Person es NestedSet. |
| A15 calificación separada del estado | CONFIRMADO | `erpnext/erpnext/crm/doctype/lead/lead.json:392-406` | `qualified_by`, `qualified_on` y `qualification_status` con tres opciones. |
| A16 origen de campaña | CONFIRMADO | `erpnext/erpnext/crm/doctype/lead/lead.json:237-266,518-544`; carpeta `crm/dashboard_chart/lead_source` | Existen tipo, tipo de solicitud, UTM y el gráfico. |
| A17 informe de embudo | CONFIRMADO | `erpnext/erpnext/crm/report/sales_pipeline_analytics/sales_pipeline_analytics.py:63-120` | Agrupa por etapa o por `_assign`, mes o trimestre de `expected_closing`; usa permisos. |
| A18 primera respuesta | CONFIRMADO | `erpnext/erpnext/crm/doctype/opportunity/opportunity.json:391`; `frappe/frappe/core/doctype/communication/communication.py:700-714` | El campo lo calcula Frappe desde la primera Communication, no el CRM; con actividades propias habría que calcularlo en Bash Logistics. |
| Hecho 1 cadena y polimorfismo | CONFIRMADO | `erpnext/erpnext/crm/doctype/opportunity/opportunity.json:115-136`; `quotation.json:170,182` | `opportunity_from` Link a DocType más `party_name` Dynamic Link. |
| Hecho 3 estados Lead y Opportunity | CONFIRMADO | `lead.json:157`; `opportunity.json:180` | Listas idénticas a las del informe. |
| Hecho 4 sin puntuación de lead | CONFIRMADO | búsqueda `lead_score` en `erpnext/` y `frappe/` | No aparece en ningún archivo; el informe decía «un archivo de pruebas», dato menor. |
| Hecho 5 Sales Stage sin orden ni probabilidad | CONFIRMADO | `erpnext/erpnext/crm/doctype/sales_stage/sales_stage.json:16-17`; `erpnext/erpnext/setup/setup_wizard/operations/install_fixtures.py:445-456`; `opportunity.json:236-241` | Ocho etapas; probabilidad libre con valor por defecto 100. |
| Hecho 7 pérdida y motivos en cotización | CORREGIDO | `erpnext/erpnext/selling/doctype/quotation/quotation.py:366-404`; `erpnext/erpnext/setup/doctype/quotation_lost_reason/quotation_lost_reason.json` | La cotización usa otro maestro, `Quotation Lost Reason`; la fila «Opportunity Lost Reason ... multi-selección en Opportunity y Quotation» de la tabla de modelo de datos es inexacta. |
| Hecho 11 Prospect agrupa leads y oportunidades | CONFIRMADO | `erpnext/erpnext/crm/doctype/prospect/prospect.py:51-66`; `lead.py:214-227,303-334`; `opportunity.py:277-305` | Tablas espejo sincronizadas a mano, como dice el informe. |
| Hecho 19 estados de la cotización | CORREGIDO | `erpnext/erpnext/selling/doctype/quotation/quotation.py:117`; `quotation.json:889` | El mapa de `status_updater.py:42-49` tiene seis estados, pero el campo admite además `Replied` y `Expired`. |
| Hecho 22 Custom Field | CONFIRMADO | `frappe/frappe/custom/doctype/custom_field/custom_field.json:83-168` | `dt`, `fieldname`, `fieldtype`, `options`, `insert_after`, `fetch_from`. |

## erpnext-finanzas

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 libro único y función de publicación | CONFIRMADO | `erpnext/erpnext/accounts/general_ledger.py:34-75,429-460` | Valida presupuesto, periodo, cuentas deshabilitadas y cuadre antes de guardar. |
| A2 anulación por asiento inverso | CONFIRMADO | `general_ledger.py:647-766`; `accounts_settings.json:486-491` | El reverso se fecha hoy solo con libro inmutable activado; por defecto marca el original `is_cancelled`. |
| A3 tolerancia y línea de redondeo | CONFIRMADO | `general_ledger.py:449-450,486-492,510` | 5/10^precisión para diarios y pagos; 0,5 para el resto. |
| A4 cartera derivada del libro | CONFIRMADO | `erpnext/erpnext/accounts/utils.py:2139-2210,2470-2531`; `payment_ledger_entry.json:33-161` | Signo por tipo de cuenta, suma por factura de origen con `delinked = 0`. ERPNext igual persiste ese libro paralelo; la vista es propuesta de Bash Logistics. |
| A5 nota crédito como factura marcada | CONFIRMADO | `erpnext/erpnext/controllers/sales_and_purchase_return.py:46-100`; `sales_invoice.json:345,450,2184`; `accounts_controller.py:617-630`; `taxes_and_totals.py:1222-1238` | Saldo de la nota en 0 salvo `update_outstanding_for_self`. |
| A6 estado derivado de saldo y vencimiento | CONFIRMADO | `erpnext/erpnext/accounts/doctype/sales_invoice/services/status.py:35-110` | Orden: vencida, parcial, impaga, nota crédito emitida, devolución, pagada. |
| A7 pago con asignaciones y deducciones | CONFIRMADO | `payment_entry.json:126-131,300-427`; `payment_entry_reference.json:33-111`; `payment_entry.py:268-269,404-415,1388-1411` | El rechazo por diferencia no cero está en `:268`; `:1388-1411` calcula la diferencia. |
| A8 plantilla de condiciones de pago | CONFIRMADO | `payment_term.json:39-69`; `payment_terms_template.py:33-39`; `payment_schedule.json:39-175` | Suma 100 % exigida; calendario materializado por factura. |
| A9 impuestos como filas | CONFIRMADO | `sales_taxes_and_charges.json:40-46,60,98`; `erpnext/erpnext/controllers/taxes_and_totals.py:401-463,544-640` | Cinco tipos de cálculo, cuenta por fila, incluido en precio. |
| A10 plantilla por ítem y Tax Rule | CONFIRMADO | `item_tax_template.json:22-57`; `item_tax_template_detail.json:14-31`; `tax_rule.py:42-66` | La cita de aplicación al documento está mal en el hecho 14 (ver abajo). |
| A11 categoría de retención con vigencias | CONFIRMADO | `tax_withholding_category.json:28-98`; `tax_withholding_rate.json:19-60`; `tax_withholding_entry.json:44-216`; `accounts/report/tax_withholding_details` | Tasa con `from_date`/`to_date`, umbral único y acumulado, cuenta por empresa. |
| A12 plan de cuentas JSON con PUC simple | CORREGIDO | `erpnext/erpnext/accounts/doctype/account/chart_of_accounts/chart_of_accounts.py:13-67`; `verified/co_plan_unico_de_cuentas_simple.json:12,17,94,570-572,648-660,684-686,1074` | La idea y las líneas son ciertas, pero el PUC simple ya trae tipos: Payable (25), Tax (21), Income Account (37), Cost of Goods Sold (27), Equity (36). Proveedores (570) y retenciones (648-660) son Payable; IVA por pagar (684) es Tax. No hay que añadir esos tipos. |
| A13 tipos de cuenta semánticos | CONFIRMADO | `account.json:136` (opciones de `account_type`); `accounts/utils.py:2149-2155`; `company.json:339-475` | Opciones incluyen Receivable, Payable, Round Off; cuentas por defecto por empresa. |
| A14 cierre por capas | CONFIRMADO | `accounts/services/gl_validator.py:99-120`; `accounting_period.py:105-149`; `period_closing_voucher.py:94-117` | Congelación con rol exento y cierre por tipo de documento. |
| A15 multimoneda mínima | CONFIRMADO | `gl_entry.json:132-138,279-291,362`; `payment_entry.py:1326-1346`; `accounts/services/exchange_gain_loss.py:14-18,56`; `exchange_rate_revaluation.py:506` | Diario «Exchange Gain Or Loss» y revaluación existen. |
| A16 conciliación bancaria | CONFIRMADO | `bank_transaction.json:63-274`; `bank_transaction_payments.json:16-49`; `bank_reconciliation_tool.py:172,338`; `bank_transaction.py:374-404` | Asignación a varios comprobantes y desconciliación. |
| A17 aplicación de anticipos y deshacer | CONFIRMADO | `payment_reconciliation.py:137-640`; `unreconcile_payment.py:45-84` | Cubre pagos, diarios y notas sin asignar. |
| A18 antigüedad de cartera | CONFIRMADO | `accounts/report/accounts_receivable/accounts_receivable.py:64-67,819-854` | Rangos `30, 60, 90, 120`; base por vencimiento o fecha de contabilización. |
| A19 controles de integridad | CONFIRMADO | `ledger_health.json:16-38`; carpetas `report/general_and_payment_ledger_comparison`, `report/invalid_ledger_entries` | Existen los dos informes y los campos de descuadre. |
| A20 localización aislada | CONFIRMADO | `erpnext/erpnext/regional/italy/utils.py:321-376,388-398,463-474` | Valida al enviar, genera XML por plantilla, adjunto privado, consecutivo por NIT; sin Colombia en `regional/`. |
| Hecho 1 libro único | CONFIRMADO | `gl_entry.json:78,90,116,124,166,176,185`; `gl_entry/README.md:1` | Líneas de campo exactas. |
| Hecho 4 compositores | CONFIRMADO | `sales_invoice.py:1183-1187`; `sales_invoice/services/gl_composer.py:22-30`; `payment_entry/services/gl_composer.py:24-30`; `general_ledger.py:34-75` | Coincide. |
| Hecho 6 libro de pagos | CONFIRMADO | `accounts/utils.py:2139-2210,2290-2343,2470` | Signos, `delinked` y reescritura de `outstanding_amount`. |
| Hecho 14 Tax Rule y aplicación | CORREGIDO | `tax_rule.py:42-66,207` y `erpnext/erpnext/accounts/party.py:854-888` | La aplicación de la regla está en `party.py` y `get_tax_template`; `services/taxes.py:26-76` solo agrega la plantilla por defecto y las de ítem. |
| Hecho 16 PUC colombiano | CORREGIDO | `co_plan_unico_de_cuentas_simple.json` (1745 líneas); `co_plan_unico_de_cuentas.json` (9399 líneas) | Falso que «en el simple solo caja, bancos y deudores llevan tipo»: el simple tiene 264 tipos (ver A12). Las cuentas citadas y las líneas 92, 570, 648, 653, 657 y 684 sí son correctas. |
| Hecho 17 cierre en tres capas | CONFIRMADO | `gl_validator.py:99-117`; `accounting_period.py:105-175`; `period_closing_voucher.py:94-117,403-418`; `gl_entry.py:430-441` | El corte de 100 000 líneas es `estimate_count > 100_000`. |
| Hecho 25 Colombia y IVA 16 % | CONFIRMADO | `erpnext/erpnext/setup/setup_wizard/data/country_wise_tax.json:447-452` | IVA genérico de 16,00. |

## erpnext-extensibilidad

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 de fábrica frente a usuario | CONFIRMADO | `frappe/frappe/custom/doctype/customize_form/customize_form.py:703-725`; `custom_field.json:488-493` | El restablecimiento borra lo que no es `is_system_generated` (excepto `naming_series` y `options`). |
| A2 capas fusionadas en un punto | CONFIRMADO | `frappe/frappe/model/meta.py:163-176,416-434,455-483` | Orden: campos custom, property setters, ordenar. |
| A3 nombre técnico derivado | CONFIRMADO | `frappe/frappe/custom/doctype/custom_field/custom_field.py:139-174`; `custom_field.json:113-123` | El prefijo `custom_` solo se aplica cuando no se da `fieldname`; el campo es de solo lectura en el formulario. |
| A4 orden de campos | CONFIRMADO | `frappe/frappe/model/meta.py:568-630` | Tres niveles de prioridad con rutas de recuperación. |
| A5 dimensiones como campos Link | CONFIRMADO | `erpnext/erpnext/accounts/doctype/accounting_dimension/accounting_dimension.py:119-125,141-175` | Alterna columnas y corre en segundo plano. |
| A6 vista guardada con dueño opcional | CONFIRMADO | `frappe/frappe/desk/doctype/list_filter/list_filter.py:54-66,200-208`; `list_filter.json:25-99` | Solo System Manager edita las globales. |
| A7 sanear filtros guardados | CORREGIDO | `list_filter.py:111-129,218-250`; `custom_field.py:235-258` | El saneo ocurre únicamente en `before_save`; no hay saneo al cargar y borrar un Custom Field no toca los List Filter (solo Property Setter y DocType Layout). No protege contra un campo eliminado después; eso sería diseño nuevo. |
| A8 firma de ruta | CONFIRMADO | `list_filter.py:129,177-197`; `list_filter.json:42`; cliente `frappe/frappe/public/js/frappe/list/list_filter/list_filter_api.js:39` | La firma se calcula al guardar y la usa el cliente. |
| A9 preferencias por usuario | CONFIRMADO | `frappe/frappe/model/utils/user_settings.py:13-75` | JSON por (usuario, tipo); caché más sincronización diferida. |
| A10 Kanban configurable | CORREGIDO | `frappe/frappe/desk/doctype/kanban_board/kanban_board.py:180-187,703-739`; `kanban_board_column.json` (`indicator`, `status` Active/Archived) | El campo principal debe ser Select (`:182`); Link aparece solo en agrupaciones alternativas con carriles dinámicos tope 20 (`:462-475,511-515`). Columnas con color y archivada: confirmado. |
| A11 Kanban privado | CONFIRMADO | `kanban_board.py:271-288,73-74` | Condición `private=0 or owner=usuario`. |
| A12 columnas solo sistema | CONFIRMADO | `erpnext/erpnext/crm/doctype/lead/lead_kanban.js:1-19` | `canMoveCard` devuelve falso para estados calculados. |
| A13 calendario mínimo | CONFIRMADO | `frappe/frappe/desk/doctype/calendar_view/calendar_view.json:19-51`; `calendar_view.py:28-43` | Valida Date o Datetime. |
| A14 vistas estándar entregadas | CONFIRMADO | `erpnext/erpnext/crm/doctype/lead/list_filter/lead_converted.json`; `kanban_board/lead_pipeline.json:49-126`; `list_filter.py:42-105` | `is_standard`, `module`, `layout_order`; solo editables en modo desarrollador. |
| A15 condiciones por campo | CONFIRMADO | `frappe/frappe/core/doctype/docfield/docfield.json:280,494,501,629`; `doctype.py:1847-1865` | `depends_on` es cadena `eval:`; `link_filters` es JSON de filas de 4 elementos. |
| A16 informes guardados | CONFIRMADO | `frappe/frappe/core/doctype/report/report.json:47-273`; `report.py:194-209,363-391` | Ejecuta con `get_list` bajo el usuario. |
| A17 flujos de aprobación | CONFIRMADO | `frappe/frappe/workflow/doctype/workflow/workflow.py:76-99,256-298`; `workflow_transition.json:24-105` | Crea Custom Field Link `workflow_state`. |
| A18 objetos personalizados con barreras | CONFIRMADO | `frappe/frappe/core/doctype/doctype/doctype.py:360,366-367,2088-2109` | Prohíbe roles automáticos y roles `is_custom` a no administradores. |
| Hecho 1 DocType es dato | CONFIRMADO | `doctype.json:203`; `doctype.py:360` | Bandera `custom`. |
| Hecho 2 custom no genera archivos | CONFIRMADO | `doctype.py:746-748,881,1152` | Coincide. |
| Hecho 7 DDL real al guardar | CONFIRMADO | `custom_field.py:223-233`; `customize_form.py:257-270` | `updatedb` y mensaje de límite de fila. |
| Hecho 8 fusión en lectura | CONFIRMADO | `meta.py:163-176,416-434,457-483` | Coincide. |
| Hecho 13 `create_custom_fields` idempotente | CONFIRMADO | `custom_field.py:335-398`; `erpnext/erpnext/crm/doctype/crm_settings/crm_settings.py:76-80` | Un solo `updatedb` por tipo. |
| Hecho 18 catálogo de «40 tipos» | CORREGIDO | `frappe/frappe/core/doctype/docfield/docfield.json:119` | Las opciones listan 45 tipos (incluye Autocomplete, Fold, Icon, Vue Component). Cifra repetida en «No conviene copiar». |

## erpnext-integracion

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 bitácora de entregas con reintento | CONFIRMADO | `frappe/frappe/integrations/doctype/webhook/webhook.py:23-25,171-220,243-337`; `webhook_request_log.json:93-110` | Estados Delivered, Failed, Exhausted; lote de 100. |
| A2 envío tras el commit | CONFIRMADO | `frappe/frappe/integrations/doctype/webhook/__init__.py:33-41,73-124` | Cola en memoria vaciada con `after_commit`, deduplicada por (webhook, documento). El outbox transaccional es mejora de Bash Logistics. |
| A3 webhooks configurables con firma | CONFIRMADO | `webhook.json:39-194`; `webhook.py:374-394` | HMAC-SHA256 en base64. La condición en Frappe es `safe_eval` de Python; el filtro declarativo es propuesta. |
| A4 bloqueo SSRF | CONFIRMADO | `frappe/frappe/utils/safe_exec.py:407-492` | Valida URL, DNS, conexión y cada salto de redirección; sin proxies del entorno. |
| A5 claves de integración | CONFIRMADO | `frappe/frappe/auth.py:657-663,740-800`; `user.py:1741-1758` | Matiz: Frappe guarda el secreto cifrado y lo descifra para comparar con `hmac.compare_digest` (`:782-783`); el hash es mejora propuesta. |
| A6 límite de tasa | CONFIRMADO | `frappe/frappe/rate_limiter.py:48-111`; `erpnext/erpnext/www/book_appointment/index.py:54-55,114-115` | Contador por ventana en caché; en Bash Logistics iría en Postgres. |
| A7 asistente de importación | CONFIRMADO | `frappe/frappe/core/doctype/data_import/data_import.json:51-59,154-163`; `data_import.py:212-233`; `importer.py:162-262,538-573` | Lote de 1000, advertencias bloqueantes, reanudación. |
| A8 mapeo de valores | CONFIRMADO | `data_import/value_mapping.py:1-60`; `importer.py:173-198` | Mapa valor-archivo a valor-sistema y creación del vinculado. |
| A9 cuenta con contactos | CORREGIDO | `frappe/frappe/core/doctype/data_import/import_provider.py:1-55`; `erpnext/erpnext/utilities/party_import_provider.py:19-82`; `erpnext/erpnext/hooks.py:790-796` | No es «una sola fila»: el comentario de hooks dice «in one file»; contactos y direcciones van como tablas hijas del mismo registro de importación. La exportación con el principal primero sí se confirma (`:53-82`). |
| A10 exportar plantilla reimportable | CONFIRMADO | `frappe/frappe/core/doctype/data_import/exporter.py:13-21,24-66` | Sin permiso `export` restringe a documentos propios. |
| A11 correo entrante a la actividad | CONFIRMADO | `frappe/frappe/email/receive.py:839-955` | Cola de salida, `message_id`, nombre en el asunto, remitente más asunto con ventana de 60 días. |
| A12 sincronización incremental por UID | CORREGIDO | `frappe/frappe/email/receive.py:221-285`; `email_account.py:743-758` | UIDVALIDITY y ventana de 100 correctos. El cursor no avanza por el correo fallido, pero sí por un correo posterior exitoso del mismo lote (condición `<` al fijar `sync_from_uid`); el reintento solo está garantizado si ningún posterior se procesa. |
| A13 portal con usuarios por cuenta | CONFIRMADO | `erpnext/erpnext/utilities/doctype/portal_user/portal_user.json:13`; `erpnext/erpnext/controllers/website_list_for_contact.py:16-30,90-132` | Solo `docstatus` 1, filtro por terceros del usuario, fila reducida, permisos elevados internos. |
| A14 formulario público y reserva verificada | CONFIRMADO | `web_form_request.json:24-84`; `web_form.py:550-574`; `appointment.py:165-180,409-417,424-428,465-479` | Token guardado con SHA-256, capacidad con `for_update`, caducidad de no verificadas. |
| A15 operaciones masivas | CONFIRMADO | `frappe/frappe/api/v2.py:33-41,334-395,469-540` | Umbral 20, 202 con trabajo, savepoint por elemento. |
| A16 traducción en capas | CONFIRMADO | `frappe/frappe/translate.py:148-200,234-249`; `translation.json:45,74,80` | Padre `es`, hijo `es-CO`, traducciones de usuario con `context`. |
| A17 apagar integración que falla | CONFIRMADO | `frappe/frappe/email/doctype/email_account/email_account.py:683-710` | Más de 5 fallos en 2 horas deshabilita y avisa a administradores. |
| Hecho 1 versiones de API | CONFIRMADO | `frappe/frappe/api/__init__.py:18-21,47-56` | Coincide. |
| Hecho 8 sin GraphQL, MCP | CONFIRMADO | `frappe/frappe/api/v2.py:674` | Ninguna mención a GraphQL en `frappe/`. |
| Hecho 10 IP permitida en claves | CONFIRMADO | `frappe/frappe/auth.py:657-663` | El comentario lo dice textualmente. |
| Hecho 31 cola de correo | CONFIRMADO | `frappe/frappe/email/doctype/email_queue/email_queue.json:65`; `frappe/frappe/hooks.py:341-342` | Estados y tareas `flush` y `retry_sending_emails`. |
| Hecho 32 Google Calendar | CONFIRMADO | `frappe/frappe/integrations/doctype/google_calendar/google_calendar.py:292-320`; `hooks.py:290-292,344` | Página de 2000 y reinicio del token con 410. |
| Hecho 39 traducciones | CONFIRMADO | `erpnext/erpnext/locale/es.po`, `main.pot` | 41 archivos, `es.po` presente y sin `es_CO`. |
