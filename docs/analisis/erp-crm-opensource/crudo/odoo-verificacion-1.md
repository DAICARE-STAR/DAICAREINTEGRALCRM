# odoo — verificación 1

Verificador con contexto fresco. Se abrió cada archivo citado en la línea citada, en `C:\Users\enzov\IA\personal\investigacion-erp\odoo`, y se intentó refutar la afirmación. Alcance: todos los elementos A1..An de «Adoptable para Bash Logistics» de los cinco informes y una muestra de 5 hechos de «Cómo lo resuelve» por informe (en operaciones se añadió el hecho 13 porque se solapa con A8). Solo lectura: no se ejecutó nada ni se editaron los informes.

Veredictos: CONFIRMADO (la cita dice eso), CORREGIDO (la idea es cierta, la cita o el detalle estaban mal; se da la cita buena), DESCARTADO (no se sostiene). Las desviaciones de línea de 1 a 3 que no cambian el sentido se dejan como CONFIRMADO.

## Totales

| Informe | Revisados | Confirmados | Corregidos | Descartados |
|---|---|---|---|---|
| odoo-modulos | 23 | 22 | 1 | 0 |
| odoo-operaciones | 22 | 19 | 3 | 0 |
| odoo-rrhh | 24 | 23 | 1 | 0 |
| odoo-extensibilidad | 20 | 20 | 0 | 0 |
| odoo-integracion | 25 | 24 | 1 | 0 |
| Total | 114 | 108 | 6 | 0 |

## odoo-modulos

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 registro de módulos en BD | CONFIRMADO | `odoo/addons/base/models/ir_module.py:144-151,299-335,807-850,1047-1075` | Estado, `application`, dependencias, exclusiones y `update_list` desde manifiestos: todo está. |
| A2 manifiesto declarativo | CONFIRMADO | `addons/crm/__manifest__.py:9-26,71,108` | Claves `depends`, `data`, `demo`, `application`, `license` presentes. |
| A3 activación con cierre de dependencias | CONFIRMADO | `ir_module.py:377-402` (`_state_update` recursivo), `:407-471` (`button_install`, exclusiones) | Cierre transitivo y chequeo de exclusiones antes de devolver. |
| A4 módulo técnico y módulo app | CONFIRMADO | `addons/sale/__manifest__.py:11-15` (sin `application`), `addons/sale_management/__manifest__.py:38,65` | `sale_management` depende de `sale` y `digest`, y es la app. |
| A5 puentes autoinstalables | CONFIRMADO | `addons/l10n_co/__manifest__.py:5,14`, `ir_module.py:417-421` (`must_install`) | `auto_install` es lista de dependencias y filtra por país de compañía. |
| A6 interruptores como banderas | CONFIRMADO | `odoo/addons/base/models/res_config.py:104-135,205-217`; `addons/crm/security/crm_security.xml:3-9`; `addons/sale/security/res_groups.xml:8-10`; `addons/stock/security/stock_security.xml:36` | Convención `group_*` con `implied_group` y `module_*` confirmada. |
| A7 roles acumulativos con privilegio | CONFIRMADO | `addons/account/security/account_security.xml:39-82`; `addons/hr/security/hr_security.xml:3-24`; `res_groups.py:75-80`; `res_groups_privilege.py:4-15` | `implied_ids` y `privilege_id` como se describe. |
| A8 permiso como fila (modelo, grupo, operación, dominio) | CONFIRMADO | `odoo/addons/base/models/ir_access.py:13-30,64-126`; `addons/crm/security/ir.access.csv:2-5` | Gerente `crud`, vendedor `cru` con dominio «mío o sin asignar», fila sin grupo = restricción. |
| A9 visibilidad de menú por grupo | CONFIRMADO | `addons/crm/views/crm_menu_views.xml:9-14` | `groups="sales_team.group_sale_salesman,sales_team.group_sale_manager"` y `web_icon`. |
| A10 localización Colombia como datos | CONFIRMADO | `addons/l10n_co/data/template/account.account-co.csv` (802 líneas), `account.tax-co.csv` (IVA 19/5, exento, RteFte, RteVAT, RteICA), `models/template_co.py:7-30`, `models/res_partner.py:18-50` | El tipo DIAN se deriva del identificador preferido que incluye `vat`; el cargador es `account.chart.template` (`chart_template.py:69,89,173,206`). |
| A11 tercero único con rangos | CONFIRMADO | `addons/account/models/partner.py:658-659,870-881`; `res_partner.py:326,346,371` | `employee` está en la línea 346 (no 348). Los rangos los incrementan además los movimientos contables (comentario en `partner.py:656-657`). |
| A12 producto con tipo, almacenable aparte y proveedor por producto | CONFIRMADO | `addons/product/models/product_template.py:74-86,138-141`; `product_supplierinfo.py:14-54` | `type` bien/servicio/combo, `is_storable` separado, `min_qty`, `price`, `delay`. |
| A13 inventario por movimientos y saldo por ubicación | CONFIRMADO | `stock_location.py:33-48`; `stock_quant.py:47-99`; `stock_move.py:107-118` | Ubicaciones virtuales de proveedor, cliente, ajuste y producción confirmadas. |
| A14 estados mínimos y avance por cantidades | CONFIRMADO | `addons/sale/models/sale_order.py:26-31,367-371`; `purchase_order_line.py:75-83` | 4 estados de pedido; `qty_received`, `qty_invoiced`, `qty_to_invoice` por línea. |
| A15 una tabla para documentos contables | CONFIRMADO | `addons/account/models/account_move.py:151-165` | `move_type` con asiento, facturas, notas y recibos. |
| A16 campos personalizados con definición en el padre | CONFIRMADO | `project_task.py:194`; `product_template.py:248`; `crm_lead.py:117-119`; `properties_base_definition.py:7-21` | Definición por proyecto, categoría y equipo; caso sin padre en `properties.base.definition`. |
| A17 reglas de automatización con disparadores cerrados | CONFIRMADO | `addons/base_automation/models/base_automation.py:161-182` | Lista de disparadores coincide con la descrita. |
| A18 etapas configurables | CONFIRMADO | `addons/crm/models/crm_stage.py:26-35`; `crm_lead.py:133-136` | `is_won`, `fold`, `rotting_threshold_days`, `group_expand`. |
| Hecho 22 (`auto_install`, países) | CONFIRMADO | `l10n_co/__manifest__.py:5,14`; `base_import/__manifest__.py:27`; `ir_module.py:417-421` | Sin desviaciones. |
| Hecho 25 (`button_install`) | CONFIRMADO | `ir_module.py:407-471` | El `while` repite hasta no quedar autoinstalables y luego valida exclusiones. |
| Hecho 26 (ajustes que instalan módulos y grupos) | CORREGIDO | `addons/stock/models/res_config_settings.py:13-45` | El informe dice once interruptores `group_*` en stock; hay 10. El resto es correcto (`crm/models/res_config_settings.py:14-15,42-44`). |
| Hecho 32 (`ir.access` en CSV) | CONFIRMADO | `ir_access.py:64-126`; `crm/security/ir.access.csv:1-5` | Sin desviaciones. |
| Hecho 35 (campos propiedad) | CONFIRMADO | `project_task.py:194`; `product_template.py:248`; `crm_lead.py:117`; `properties_base_definition.py:7-21` | Sin desviaciones. |

## odoo-operaciones

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 plantilla y variante con índice único parcial | CONFIRMADO | `addons/product/models/product_product.py:89,164,452-456` | `UniqueIndex("(product_tmpl_id, combination_indices) WHERE active IS TRUE")`. |
| A2 almacenable separado de tracking | CONFIRMADO | `product_template.py:138-141`; `addons/stock/models/product.py:830-837`; `stock_move_line.py:759-766` | `_synchronize_quant` devuelve `0, False` si no es almacenable. |
| A3 saldo (quant) más movimientos, actualización al validar | CONFIRMADO | `stock_quant.py:20-100,1078-1146`; `stock_move_line.py:759-779` | `try_lock_for_update` en la línea 1122 (equivale al `FOR UPDATE` propuesto). |
| A4 ubicaciones en árbol con tipo de uso | CONFIRMADO | `stock_location.py:16-17,33-48,406-408` | `_parent_store` y `should_bypass_reservation` para las cuatro virtuales. |
| A5 bodega con pasos configurables | CONFIRMADO | `stock_warehouse.py:56-67,610-650` | Las ubicaciones Input, QC, Output y Packing se activan por `reception_steps` y `delivery_steps`. |
| A6 ajuste como movimiento contra ubicación de ajuste | CONFIRMADO | `stock_quant.py:107-111,222,231-236,1036-1068,1302-1341` | `is_inventory=True`, ubicación `property_stock_inventory`, `is_outdated` presente. |
| A7 lotes y seriales en un modelo, creación al recibir | CONFIRMADO | `stock_lot.py:42,116-137`; `stock_move_line.py:52-53,638-664`; `stock_quant.py:909-911` | Unicidad por (compañía, producto, nombre) con cruce contra lotes sin compañía. |
| A8 estrategia de salida jerárquica y FEFO | CORREGIDO | `stock_quant.py:658-668,781-788`; `addons/stock/data/stock_data.xml:6-18`; FEFO solo en `stock/models/product.py:1286` y `stock_location.py:77` | La jerarquía categoría, ubicación y padres, luego FIFO es cierta. FEFO no está implementado en el clon (solo texto de ayuda; depende de `product_expiry`, ausente): la idea de FEFO no tiene cita de código. |
| A9 unidad base única, cantidad en unidad del documento | CONFIRMADO | `stock_move.py:55-58,176-178`; `stock_quant.py:78-83`; `product_uom.py:13-19` | Sin desviaciones. |
| A10 proveedor por producto con precio, vigencia y plazo | CONFIRMADO | `product_supplierinfo.py:14-58`; `product_product.py:1274-1325` | Orden por precio descontado convertido a moneda de la empresa. |
| A11 reposición mínimo-máximo con cantidad manual | CONFIRMADO | `stock_orderpoint.py:57,89,127-130,405-452,499-513` | `max(min, max) - proyección` con múltiplo; `qty_to_order_manual` pisa al calculado. |
| A12 orden de compra con aprobación por monto | CONFIRMADO | `purchase_order.py:108-114,708-722,1332-1342` | `_approval_allowed`: `one_step`, `two_step` bajo el umbral, o gerente de compras. |
| A13 política de facturación por producto y estados derivados | CONFIRMADO | `purchase/models/product.py:14-18`; `purchase_order_line.py:211-224`; `purchase_order.py:50-70,281-290` | Sin desviaciones. |
| A14 recepción parcial con backorder | CONFIRMADO | `stock_picking.py:1420-1467`; `stock_picking_type.py:193-198` | `create_backorder` con `ask`, `always`, `never`. |
| A15 fabricación ligera con BoM, kits y orden | CONFIRMADO | `mrp_bom.py:28-51,455-510,659-688`; `mrp_production.py:1416-1431,1454-1514,2079-2110` | `explode` es recursivo sobre kits; la orden genera un move por componente y los del terminado. |
| A16 existencias proyectadas calculadas | CONFIRMADO | `stock/models/product.py:213-217,261-268` | `virtual_available = qty_available + incoming - outgoing` desde quants y moves pendientes. |
| Hecho 5 (unidades y empaques) | CONFIRMADO | `product_template.py:167-171`; `product_product.py:91-93`; `product_uom.py:13-19`; `stock_move.py:55-58,176-178`; `stock_quant.py:78-83` | Sin desviaciones. |
| Hecho 10 (existencias derivadas) | CONFIRMADO | `stock/models/product.py:205-270` | Retroceso con moves hechos posteriores en las líneas 226-258. |
| Hecho 13 (estrategia de salida) | CORREGIDO | `stock_quant.py:658-668,781-788` | La lista «FIFO, LIFO, cercano, menos paquetes, FEFO» incluye FEFO, que no está en el código del clon (ver A8). |
| Hecho 14 (reserva en columna propia) | CONFIRMADO | `stock_quant.py:130-133,1148-1160`; `stock_move_line.py:97-98` | El índice parcial incluye también `state IS NULL`. |
| Hecho 17 (orden de compra, aprobación, cancelación) | CORREGIDO | `purchase_order.py:733-741` | La orden no se cancela con facturas cuyo estado no sea `cancel` ni `draft`: una factura en borrador no la bloquea. El informe dice «no canceladas». |
| Hecho 19 (recepción manual sin `purchase_stock`) | CONFIRMADO | `purchase_order_line.py:77,292-297,301` | `qty_received_method` solo admite `manual` en este clon. |

## odoo-rrhh

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 empleado y versiones con vigencia | CONFIRMADO | `hr_employee.py:51-84,835-865`; `hr_version.py:60,190-193` | `_inherits` a `hr.version`; `current_version_id` almacenado y cron diario. |
| A2 alta de cambio por copia | CONFIRMADO | `hr_employee.py:912-1000` | El docstring confirma que, si ya existe una versión en esa fecha, se devuelve sin escribir los valores. |
| A3 contrato sin solape | CONFIRMADO | `hr_version.py:148-152,185-188,245-292` | `check_contract_finished` exige cerrar el contrato anterior. La restricción de exclusión es una propuesta de Bash Logistics. |
| A4 plantilla de contrato y catálogo por país | CONFIRMADO | `hr_version.py:162,295-317,546`; `hr_employee_type.py:6-20`; `hr/data/hr_employee_type_data.xml:4-40` | Los tipos de Odoo no son los colombianos; la siembra local es propuesta. |
| A5 privacidad en dos capas con vista pública | CONFIRMADO | `hr_employee_public.py:10-16,251-286`; `hr/security/ir.access.csv:4,7`; `hr_employee.py:33-39` | Vista SQL `JOIN hr_version ON v.id = e.current_version_id`. |
| A6 visibilidad escalonada por jerarquía | CONFIRMADO | `hr_employee_public.py:153-157,175,213-228`; `hr_employee.py:774-810` | `is_manager` por `child_of` en `parent_id`. |
| A7 datos sensibles solo para RR. HH., cumpleaños opcional | CONFIRMADO | `hr_employee.py:167-178,204-238,312-318,1436-1441` | Todos con `groups="hr.group_hr_user"`; cumpleaños devuelve «hidden» por defecto. |
| A8 contacto de trabajo y cuentas bancarias | CONFIRMADO | `hr_employee.py:165,1217-1235,205-216`; `ir.access.csv:52-54` | Las cuentas se filtran por `partner_id = work_contact_id`. |
| A9 proceso de salida con registro propio | CORREGIDO | `hr_employee_departure.py:43-57,123-140,177-190,198-271`; `hr_employee.py:2370-2410,3139`; `hr_holidays/models/hr_employee.py:408-409` | Al archivar se vacían `parent_id`, `coach_id` y el aprobador de ausencias (`leave_manager_id`); no hay un «responsable» en la lista, como dice el informe. El resto es cierto, incluido el borrado de versiones posteriores a la salida. |
| A10 departamentos con ruta y gerente | CONFIRMADO | `hr_department.py:12-35`; `hr_employee.py:286-312` | `_parent_store`, `manager_id`, `coach_id` con valor por defecto del gerente. |
| A11 cargo con meta de contratación | CONFIRMADO | `hr_job.py:22-27,47-54`; `hr_version.py:116-117` | Único por nombre, empresa y departamento. |
| A12 tipo de ausencia declarativo | CONFIRMADO | `hr_holidays/models/hr_work_entry_type.py:62-124` | Todas las banderas citadas existen. |
| A13 solicitud con estados y transiciones por usuario | CONFIRMADO | `hr_leave.py:134-141,2497-2600` | `_get_next_states_by_state` y `_check_approval_update`. |
| A14 saldo por asignaciones y consumo calculado | CONFIRMADO | `hr_holidays/models/hr_employee.py:621-645`; `hr_leave_allocation.py:30-36,150-162` | Orden de descuento: con vencimiento, acumulación y el resto. |
| A15 plan de acumulación por niveles | CONFIRMADO | `hr_leave_accrual_plan.py:13-42`; `hr_leave_accrual_plan_level.py:15-47,100-139`; `resource_calendar.py:10`; `hr_version.py:411-418` | La cifra colombiana (15 días hábiles, 1,25 mensual) no sale del repo; es cálculo propio del informe. |
| A16 ausencia aprobada proyectada a calendario | CONFIRMADO | `hr_leave.py:1982-2030`; `resource_calendar_leaves.py:10-40`; `wizard/load_public_holiday_wizard.py` | El asistente de festivos existe; no se leyó a fondo. |
| A17 descripción privada de la ausencia | CONFIRMADO | `hr_leave.py:133,560-585` | Enmascara con `*****` y limita la búsqueda. |
| A18 días obligatorios | CONFIRMADO | `hr_leave_mandatory_day.py:8-25`; `hr_leave.py:242,859-888` | Por departamento, cargo y horario; `has_mandatory_day` avisa. |
| A19 ubicación de trabajo por día | CONFIRMADO | `hr_employee_location.py:6-25`; `hr_work_location.py:11-26` | Único por empleado y fecha. |
| Hecho 2 (vigencia de versiones) | CONFIRMADO | `hr_version.py:60,190-193`; `hr_employee.py:835-870` | La versión vigente ignora las fechas de contrato. |
| Hecho 7 (vista pública) | CONFIRMADO | `hr_employee.py:33-41`; `hr_employee_public.py:10-16,251-286` | Sin desviaciones. |
| Hecho 13 (salida) | CONFIRMADO | `hr_employee_departure.py:43-57,177-190,198-271` | Cron diario y borrado de versiones posteriores a la fecha de salida. |
| Hecho 16 (transiciones de ausencia) | CONFIRMADO | `hr_leave.py:2497-2550` | Sin desviaciones. |
| Hecho 21 (privacidad en ausencias) | CONFIRMADO | `hr_leave.py:133,562-585` | Sin desviaciones. |

## odoo-extensibilidad

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 JSONB con definición separada del valor | CONFIRMADO | `odoo/orm/fields_properties.py:34-53,55,118-127,626-645` | Solo el valor vive en el hijo; los valores huérfanos se ignoran al leer. |
| A2 contenedor opcional y caso global | CONFIRMADO | `properties_base_definition.py:5-21`; `properties_base_definition_mixin.py:8-20`; `res_partner.py:275` | Una definición única por campo (`UNIQUE(properties_field_id)`). |
| A3 lista blanca de tipos y claves | CONFIRMADO | `fields_properties.py:82-89,991-995,1174-1176` | `ALLOWED_KEYS` y `ALLOWED_TYPES` como se citan. |
| A4 identificador interno estable | CONFIRMADO | `fields_properties.py:29-31,484-486,682-684` | 16 caracteres del UUID; la validación con expresión regular precede al SQL. |
| A5 filtro y agrupación por JSONB | CONFIRMADO | `fields_properties.py:686-797,799-895`; `crm_lead_views.xml:665,993` | No hay índice por propiedad en el archivo; el comentario de duplicado en etiquetas está en 687-688. |
| A6 edición de la definición desde el formulario | CONFIRMADO | `fields_properties.py:288-335`; `crm_lead_views.xml:543` | Bandera `definition_changed` y `definition_deleted`. |
| A7 filtros guardados privados o compartidos | CONFIRMADO | `ir_filters.py:9-42,83-87,99-120` | Dominio con `ast.literal_eval`; `user_ids` vacío = todos. |
| A8 limpiar contexto al compartir | CONFIRMADO | `ir_filters.py:44-50` | `_sanitize_shared_context`. |
| A9 etapas editables | CONFIRMADO | `crm_stage.py:26-35`; `crm_lead.py:133-136`; `crm_lead_views.xml:503-504` | Sin desviaciones. |
| A10 preferencias de vista por usuario | CONFIRMADO | `ir_ui_view.py:73-84,664-668` | Las personalizaciones se borran al editar la vista base. |
| A11 pantallas declarativas por entidad | CONFIRMADO | `ir_actions.py:243-262,293-315,390-405` | `view_mode`, `limit=80`, `mobile_view_mode` y modo único por acción. |
| A12 vistas con configuración mínima | CONFIRMADO | `crm_lead_views.xml:389,503-504` | Calendario con `date_start`, `color`, `mode`; kanban con `default_group_by`. |
| A13 exportaciones y defaults por usuario | CONFIRMADO | `ir_exports.py:9-20,160-167`; `ir_default.py:13-28` | Sin desviaciones. |
| A14 tipos de documento personalizados | CONFIRMADO | `ir_model.py:233-241`; `addons/mail/models/ir_model.py:12-20` | `x_name` por defecto y casillas de hilo, actividad y lista negra. La recomendación de posponer es juicio del informe. |
| A15 automatización sin «ejecutar código» | CONFIRMADO | `base_automation.py:161-186`; `ir_actions.py:565-600` | Los tipos de acción incluyen `code`; excluirlo es propuesta. |
| Hecho 2 (prefijo `x_`) | CONFIRMADO | `ir_model.py:772-775` | Restricción `CHECK (state != 'manual' OR name LIKE 'x\_%')`. |
| Hecho 3 (alta y renombre alteran esquema) | CONFIRMADO | `ir_model.py:1183-1215,1276-1302` | `ALTER TABLE ... RENAME COLUMN` y renombre del índice. |
| Hecho 6 (cálculo en texto con `safe_eval`) | CONFIRMADO | `ir_model.py:54-58,645-655` | Sin desviaciones. |
| Hecho 11 (tipos y claves de Properties) | CONFIRMADO | `fields_properties.py:82-89,985-998,1174` | Sin desviaciones. |
| Hecho 25 (`ir.filters`) | CONFIRMADO | `ir_filters.py:9-52,80-122` | Sin desviaciones. |

## odoo-integracion

| Elemento | Veredicto | Cita comprobada | Nota |
|---|---|---|---|
| A1 importador con simulacro y mapeo | CONFIRMADO | `addons/base_import/models/base_import.py:95-115,128-190,1534-1594` | `savepoint` cerrado con `rollback=dryrun`; `base_import.mapping` guarda columna y campo. |
| A2 identificador externo estable | CONFIRMADO | `odoo/addons/base/models/ir_model.py:2303-2330`; `odoo/orm/models.py:632-660,1121-1140` | `UniqueIndex('(module, name)')` y módulo `__export__` al exportar. |
| A3 lectura de CSV y XLSX | CORREGIDO | `base_import.py:609-675` (CSV), `:474-520` (XLSX) | El CSV con `chardet` y separadores probados está bien; la lectura XLSX está en `_read_xlsx` desde la línea 474, no en 421-475 (ahí está `_read_xls`). |
| A4 claves de API con hash, prefijo y vencimiento | CONFIRMADO | `res_users.py:1598-1640,1682-1706,1814-1846` | `token_hex(20)` más `_oak`, pbkdf2_sha512 a 6000 rondas, índice de 8 caracteres. |
| A5 duración máxima de clave por rol | CONFIRMADO | `res_groups.py:40-41`; `res_users.py:1668-1680` | Solo el administrador crea claves sin vencimiento. |
| A6 webhook de entrada | CONFIRMADO | `base_automation.py:119-126,148-152,270-278,536-538,594-640`; `controllers/main.py:6-21` | UUID rotable, `auth='public'`, `csrf=False`, 404 y 500 sin detalle. |
| A7 webhook de salida tras el commit | CONFIRMADO | `ir_actions.py:767-781,1062-1100,1219-1220` | La advertencia de campos con grupo bloquea la ejecución (`_run` falla si hay `warning`), no es solo informativa. |
| A8 alias de correo con política | CONFIRMADO | `mail_alias.py:39-95`; `mail_thread.py:1172-1190,1234-1244`; `crm_team.py:171-180` | `alias_contact`: everyone, partners, followers. |
| A9 enrutar por `References` y `In-Reply-To` | CONFIRMADO | `mail_thread.py:1234-1246`; `mail_message.py:~299` | Últimos 32 identificadores. |
| A10 cola de correo saliente | CONFIRMADO | `mail_mail.py:79-108,208-226,229-262` | Estados, `failure_type`, `scheduled_date`, `action_retry`. |
| A11 enlace de portal con token | CONFIRMADO | `portal_mixin.py:10-42`; `portal/controllers/portal.py:1093-1112` | `consteq` solo si falla el control normal. |
| A12 aceptar cotización con firma | CONFIRMADO | `addons/sale/controllers/portal.py:347-405,414-445` | Guarda `signed_by`, `signed_on`, `signature`, genera PDF y lo publica. |
| A13 portal como usuario externo con reglas de fila | CONFIRMADO | `addons/sale/security/ir.access.csv:29,36`; `portal/wizard/portal_wizard.py:134-200` | Dominio `child_of commercial_partner_id`; el asistente crea el usuario y envía invitación. |
| A14 contadores del portal por módulo | CONFIRMADO | `portal/controllers/portal.py:193-227` | Gancho `_prepare_portal_counter_values` devuelve modelo, dominio y acceso. |
| A15 traducciones en JSONB | CONFIRMADO | `odoo/orm/fields_textual.py:63-95`; `res_lang.py:84-136` | `en_US` de respaldo al escribir. |
| A16 plantilla con idioma por contacto | CONFIRMADO | `mail_render_mixin.py:67-72,780-802`; `res_partner.py:308` | Agrupa por idioma en `_classify_per_lang`. |
| A17 tipos de documento DIAN | CONFIRMADO | `l10n_co/tools/partner_identifiers.py:6-31,22-71`; `l10n_co/models/res_partner.py:32-50` | NIT 31, cédula 13, pasaporte 41, extranjero 42, NIT extranjero 50. |
| A18 exportaciones y filtros guardados | CONFIRMADO | `ir_exports.py:9-17,160-167`; `ir_filters.py:9-27` | Sin desviaciones. |
| A19 permiso explícito de exportar | CONFIRMADO | `odoo/orm/models.py:937` | `is_admin()` o grupo `base.group_allow_export`. |
| A20 lectura de correo aislada por mensaje | CONFIRMADO | `fetchmail.py:21,263-345` | Tras 5 días de fallo vuelve a borrador y avisa al administrador. |
| Hecho 2 (clave hasheada) | CONFIRMADO | `res_users.py:1598-1606,1682-1706` | Sin desviaciones. |
| Hecho 5 (`auth='bearer'`) | CONFIRMADO | `odoo/addons/base/models/ir_http.py:318-358` | Sin desviaciones. |
| Hecho 7 (webhook de entrada) | CONFIRMADO | `base_automation.py:148-152,270-278`; `controllers/main.py:6-21` | Sin desviaciones. |
| Hecho 14 (simulacro con savepoint) | CONFIRMADO | `base_import.py:1534-1594` | Sin desviaciones. |
| Hecho 23 (correo entrante cada 5 minutos) | CONFIRMADO | `mail/data/ir_cron_data.xml:40-48`; `fetchmail.py:20,263-341,355-362` | El cron se activa y desactiva según haya servidores confirmados. |

## Resumen de correcciones

1. odoo-modulos hecho 26: stock declara 10 interruptores `group_*`, no 11.
2. odoo-operaciones A8 y hecho 13: FEFO no está implementado en el clon; solo aparece en el texto de ayuda de `stock/models/product.py:1286` y `stock_location.py:77`. Las estrategias codificadas son FIFO, LIFO, cercano y menos paquetes.
3. odoo-operaciones hecho 17: una orden de compra con facturas en borrador sí se puede cancelar; solo la bloquean las facturas que no estén canceladas ni en borrador.
4. odoo-rrhh A9: al archivar se vacían jefe, coach y aprobador de ausencias; no un «responsable».
5. odoo-integracion A3: la lectura XLSX está en `base_import.py:474-520`.

Ningún elemento fue DESCARTADO. Fuera de las correcciones, las citas comprobadas coinciden con los archivos con desviaciones de 0 a 2 líneas.
