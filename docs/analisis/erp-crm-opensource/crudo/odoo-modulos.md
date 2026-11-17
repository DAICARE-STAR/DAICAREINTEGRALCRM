# odoo — modulos

Alcance: catálogo de módulos, manifiesto, dependencias, datos, vistas, permisos e instalación. Todas las rutas son relativas a `C:\Users\enzov\IA\personal\investigacion-erp\odoo`. Licencia LGPL-3: solo se estudian ideas; no se copia código.

## Cómo lo resuelve (hechos, cada uno con su cita ruta/relativa/archivo:línea)

**Catálogo de módulos presentes y qué hace cada uno (una línea)**

1. `base` (núcleo): ORM, usuarios, grupos, partners, vistas, menús, módulos. `odoo/addons/base/__manifest__.py` y `odoo/addons/base/models/`.
2. `mail` (Discuss): chatter, actividades, seguimiento de cambios, alias de correo, plantillas. Es app y dependencia casi universal. `addons/mail/__manifest__.py:3-9,142`.
3. `contacts`: libreta de direcciones (clientes, proveedores) sobre `res.partner`. `addons/contacts/__manifest__.py:5-13`.
4. `product`: productos, variantes, categorías, listas de precios, proveedores por producto. No es app (módulo de soporte). `addons/product/__manifest__.py:4-7`.
5. `analytic`: contabilidad analítica (cuentas, planes, distribución). `addons/analytic/__manifest__.py:4-7`.
6. `account` ("Invoicing"): facturas, pagos, diarios, impuestos, plan de cuentas, conciliación. `addons/account/__manifest__.py:3-16,96`.
7. `l10n_co`: plan de cuentas (PUC), impuestos IVA y retenciones, tipos de identificación DIAN para Colombia. `addons/l10n_co/__manifest__.py:3-14`.
8. `sale` (técnico) y `sale_management` ("Sales", la app): cotización, pedido, factura; plantillas de cotización. `addons/sale/__manifest__.py:11-15`, `addons/sale_management/__manifest__.py:4-17,38,65`.
9. `purchase`: solicitud de cotización, orden de compra, factura de proveedor. `addons/purchase/__manifest__.py:4-10,39`.
10. `stock` ("Inventory"): almacenes, ubicaciones, albaranes, movimientos, existencias, lotes, reglas de reposición. `addons/stock/__manifest__.py:4-10,98`.
11. `mrp` ("Manufacturing"): listas de materiales y órdenes de fabricación. `addons/mrp/__manifest__.py:5-11,53`.
12. `crm`: leads, oportunidades, etapas, motivos de pérdida, equipos de venta. `addons/crm/__manifest__.py:5-23,71`.
13. `project`: proyectos y tareas. `addons/project/__manifest__.py:4-9,65`.
14. `hr` (Employees) y `hr_holidays` (Time Off): ficha de empleado, departamentos, puestos; ausencias, asignaciones y planes de acumulación. `addons/hr/__manifest__.py:4-8,62`, `addons/hr_holidays/__manifest__.py:4-8,26,102`.
15. `base_automation`: reglas "cuando ocurra X en el modelo Y, haz Z". `addons/base_automation/__manifest__.py:4-16`.
16. `base_import`: importación de archivos, se autoinstala. `addons/base_import/__manifest__.py:24-27`.
17. `portal`: acceso de clientes externos a sus documentos. `addons/portal/__manifest__.py:4-7`.

**Manifiesto: cómo declara un módulo sus piezas**

18. El manifiesto es un diccionario Python en `__manifest__.py`. Claves usadas: `name`, `category`, `sequence`, `summary`, `depends`, `data` (lista ordenada de XML/CSV), `demo`, `assets`, `application`, `auto_install`, `post_init_hook`, `uninstall_hook`, `license`. Ejemplo completo en `addons/crm/__manifest__.py:5-71` y `addons/purchase/__manifest__.py:4-40`.
19. El orden de `data` importa y es explícito: seguridad primero, luego datos semilla, asistentes, vistas y menús al final. `addons/crm/__manifest__.py:25-60` (`security/crm_security.xml` en la línea 25, `views/crm_menu_views.xml` en la 59); `addons/stock/__manifest__.py:20-30` hace lo mismo. `sale_management` comenta que define plantillas y acciones antes de su lugar de uso (`addons/sale_management/__manifest__.py:41`).
20. Dependencias: lista de nombres en `depends`. Las apps verticales cuelgan de un módulo de soporte: `purchase` depende solo de `account` (`addons/purchase/__manifest__.py:10`); `sale` de `sales_team`, `account_payment` y `utm` (`addons/sale/__manifest__.py:11-15`); `sale_management` de `sale` (`addons/sale_management/__manifest__.py:38`); `mrp` de `product`, `stock`, `resource` (`addons/mrp/__manifest__.py:11`); `stock` solo de `product` y utilidades (`addons/stock/__manifest__.py:8`). `purchase` y `stock` no se exigen entre sí: el vínculo compra-recepción vive en un módulo puente que este clon no trae.
21. Una función puede partirse en módulo técnico y app: `sale` no marca `application` y `sale_management` sí (`addons/sale_management/__manifest__.py:65`; `addons/sale/__manifest__.py` no tiene la clave). La app es el interruptor visible; el técnico guarda el modelo.
22. Módulos puente con autoinstalación: `l10n_co` declara `'auto_install': ['account']`, o sea "instálate cuando `account` esté instalado" (`addons/l10n_co/__manifest__.py:14`); `base_import` usa `True` (`addons/base_import/__manifest__.py:27`). La lista indica qué dependencias disparan la instalación (`odoo/addons/base/models/ir_module.py:416-422`). Si el módulo declara `countries`, solo se instala si alguna compañía está en ese país (`ir_module.py:419-422`; `l10n_co` declara `'countries': ['co']` en `addons/l10n_co/__manifest__.py:5`).
23. Exclusiones: un módulo puede declarar `excludes` y la instalación falla si el excluido está presente (`odoo/addons/base/models/ir_module.py:438-447`; modelo `ir.module.module.exclusion` en la línea 1113). También hay categorías exclusivas (`ir_module.py:94`, comprobación en `457-471`).

**Instalación y activación**

24. Hay un catálogo en base de datos: `ir.module.module` con `state` (`uninstallable`, `uninstalled`, `installed`, `to upgrade`, `to remove`, `to install`) (`odoo/addons/base/models/ir_module.py:144-151,310`), `application` (328), `auto_install` (306), dependencias (`dependencies_id`, 301) y exclusiones (304). Se alimenta leyendo los manifiestos del disco: `update_list` (807) crea o actualiza filas y `_update_from_terp` (843) rellena dependencias, países, exclusiones y categoría.
25. `button_install` (407) marca el módulo y sus dependencias como `to install` de forma recursiva (`_state_update`, 377), repite el cálculo hasta que no queden autoinstalables pendientes (413-434), valida exclusiones y categorías exclusivas, y recién entonces se recarga el sistema. La desinstalación pasa por un asistente (`button_uninstall`, 677).
26. Los ajustes también instalan módulos: en `res.config.settings` un booleano `module_<nombre>` instala o desinstala ese módulo al guardar, y un booleano `group_<nombre>` con `implied_group` agrega o quita un grupo implícito a los usuarios (`odoo/addons/base/models/res_config.py:104-135` documenta la convención; `208-217` la implementa; `373-375` decide qué instalar o desinstalar). `crm` lo usa: `group_use_lead` y `group_use_recurring_revenues` activan funciones sin instalar nada; `module_crm_iap_mine` instala módulos (`addons/crm/models/res_config_settings.py:14-19,42-44`). `stock` tiene once interruptores `group_*` (lotes, paquetes, rutas multipaso) y varios `module_*` (`addons/stock/models/res_config_settings.py:13-45`).
27. Ganchos de instalación: `post_init_hook` (por ejemplo `purchase` crea cuentas de acumulación al instalarse, `addons/purchase/__init__.py:10-20`) y `uninstall_hook` (`addons/mrp/__manifest__.py:54-55`).
28. Datos fiscales por país como datos del módulo: `l10n_co` declara el plan de cuentas con un decorador por código de país (`@template('co')`) que devuelve configuración de compañía, cuentas y mapeos (`addons/l10n_co/models/template_co.py:7-30`). Cuentas e impuestos son CSV (`addons/l10n_co/data/template/account.account-co.csv`, 802 filas; `account.tax-co.csv`, con IVA, reteIVA y sus cuentas). El cargador es `account.chart.template` (`addons/account/models/chart_template.py:71,91,173,206`).

**Permisos por módulo**

29. Cada módulo trae su `security/` y lo carga primero (`addons/crm/__manifest__.py:25`). Tres capas: grupos (`res.groups`), un agrupador visual llamado privilegio (`res.groups.privilege`, `odoo/addons/base/models/res_groups_privilege.py:4-15`) y reglas de acceso.
30. Grupos jerárquicos por herencia: `implied_ids` hace que un grupo incluya a otro. Contabilidad: `group_account_invoice` implica `base.group_user` y `group_account_manager` implica `group_account_invoice` (`addons/account/security/account_security.xml:39-82`). RR. HH.: `group_hr_user` implica `base.group_user` y `group_hr_manager` implica `group_hr_user` (`addons/hr/security/hr_security.xml:3-24`). El campo está en `odoo/addons/base/models/res_groups.py:75-80`.
31. Grupos que son interruptores de funciones, sin rol detrás: `crm.group_use_lead`, `sale.group_discount_per_so_line`, `stock.group_production_lot` (`addons/crm/security/crm_security.xml:3-9`; `addons/sale/security/res_groups.xml:8-10`; `addons/stock/security/stock_security.xml:36`).
32. Reglas de acceso en un solo CSV: `security/ir.access.csv` con columnas `id,name,model_id,group_id/id,operation,domain`. El modelo `ir.access` unifica permiso por modelo y regla por fila: `operation` es un subconjunto de `crud` y `domain` filtra registros (`odoo/addons/base/models/ir_access.py:64-126`). En `crm.lead`, el gerente ve todo con `crud`; el vendedor tiene `cru` con dominio "mío o sin asignar"; otro grupo "ver todos los leads" no tiene dominio (`addons/crm/security/ir.access.csv:2-4`). Una fila sin grupo es una restricción global (la de multicompañía, línea 5).
33. Menús con visibilidad por grupo: la raíz de CRM declara `groups="sales_team.group_sale_salesman,sales_team.group_sale_manager"` y `web_icon` (`addons/crm/views/crm_menu_views.xml:10-15`).

**Vistas**

34. Vistas, acciones y menús son XML dentro de `views/`, listados en `data`. Un módulo extiende modelos y vistas de otro sin editarlo: `crm` extiende `res.partner` (`addons/crm/models/res_partner.py:6-7`) y su formulario (`addons/crm/views/res_partner_views.xml:4-7`, `inherit_id` a la vista base); `sale` agrega `invoice_policy` al producto (`addons/sale/models/product_template.py:43`) y `account` agrega `taxes_id` (`addons/account/models/product.py:79`).

**Campos personalizados**

35. Odoo tiene campos propiedad (`fields.Properties`) cuya definición vive en el registro padre: la tarea toma su definición del proyecto (`addons/project/models/project_task.py:194`), el producto de su categoría (`addons/product/models/product_template.py:248`) y el lead de su equipo (`addons/crm/models/crm_lead.py:117`). Si no hay padre, la definición se guarda en `properties.base.definition` (`odoo/addons/base/models/properties_base_definition.py:7-21`).

## Modelo de datos (tabla: entidad, campos clave, relaciones, cita)

| Entidad | Campos clave | Relaciones | Cita |
|---|---|---|---|
| `ir.module.module` | `name`, `state`, `application`, `auto_install`, `category_id`, `sequence`, `license` | `dependencies_id` (1..n), `exclusion_ids` (1..n), `country_ids` (n..n) | `odoo/addons/base/models/ir_module.py:161-335` |
| `ir.module.module.dependency` | `name`, `auto_install_required` | `module_id` al módulo, `depend_id` calculado | `ir_module.py:1047-1075` |
| `res.groups` / `res.groups.privilege` | `name`, `sequence`, `implied_ids`, `all_implied_ids`; privilegio: `category_id`, `placeholder` | grupo, privilegio, categoría de módulo | `odoo/addons/base/models/res_groups.py:14-80`; `res_groups_privilege.py:4-15` |
| `ir.access` | `model_id`, `group_id`, `operation` (crud), `domain`, `kind`, `active` | modelo y grupo (grupo vacío = restricción global) | `odoo/addons/base/models/ir_access.py:64-126` |
| `res.partner` | `is_company`, `parent_id`, `type`, `vat`, `customer_rank`, `supplier_rank`, cuentas por cobrar y pagar y plazo de pago por compañía | contacto hijo a empresa; `commercial_partner_id` | `odoo/addons/base/models/res_partner.py:326,348,371`; `addons/account/models/partner.py:593-603,658-659` |
| `product.template` / `product.product` | `type` (bien, servicio, combo), `is_storable`, `categ_id`, `list_price`, `standard_price`, `uom_id`, `sale_ok`, `purchase_ok`, `default_code`, `barcode` | plantilla 1..n variantes; `seller_ids` a `product.supplierinfo` | `addons/product/models/product_template.py:74-209`; `product_product.py:16,61` |
| `product.supplierinfo` | `partner_id`, `min_qty`, `price`, `delay`, `date_start`, `currency_id` | proveedor y plantilla de producto | `addons/product/models/product_supplierinfo.py:14-52` |
| `crm.lead` | `type` (lead u oportunidad), `stage_id`, `user_id`, `team_id`, `partner_id`, `expected_revenue`, `probability`, `priority`, `date_deadline`, `lost_reason_id`, `lead_properties` | etapa, equipo, vendedor, contacto, motivo de pérdida | `addons/crm/models/crm_lead.py:85,107-247` |
| `crm.stage` | `sequence`, `is_won`, `fold`, `rotting_threshold_days`, `requirements` | `team_ids` n..n a equipos | `addons/crm/models/crm_stage.py:21-35` |
| `sale.order` / `sale.order.line` | pedido: `state` (cotización, enviada, pedido, cancelada), `invoice_status`, `amount_total`; línea: `product_uom_qty`, `price_unit`, `discount`, `tax_ids`, `qty_delivered`, `qty_invoiced`, `qty_to_invoice` | línea a pedido; `invoice_ids` a `account.move` | `addons/sale/models/sale_order.py:26-31,85-95,360-370`; `sale_order_line.py:42-338` |
| `purchase.order` / `.line` | `state` (RFQ, enviada, por aprobar, orden, cancelada), `invoice_status`; línea: `qty_received`, `qty_invoiced`, `qty_to_invoice`, `price_unit` | línea a orden; `invoice_lines` a líneas de factura | `addons/purchase/models/purchase_order.py:108-114,130-132`; `purchase_order_line.py:50-83` |
| `stock.location` | `usage` (proveedor, vista, interna, cliente, ajuste, producción, tránsito); jerarquía por `location_id` | árbol de ubicaciones | `addons/stock/models/stock_location.py:14-45` |
| `stock.quant` | `product_id`, `location_id`, `lot_id`, `quantity`, `reserved_quantity`, `inventory_quantity` | existencia por producto y ubicación | `addons/stock/models/stock_quant.py:47-99` |
| `stock.move` / `stock.picking` | movimiento: `product_uom_qty`, `location_id`, `state` (nuevo, espera, confirmado, parcial, disponible, hecho, cancelado); albarán: `state`, `partner_id`, `picking_type_id`, `move_ids`, `origin` | movimientos agrupados en albarán | `addons/stock/models/stock_move.py:59-129`; `stock_picking.py:37-113` |
| `account.move` | `move_type` (asiento, factura de cliente, nota crédito de cliente, factura de proveedor, nota crédito de proveedor, recibos) y líneas | una sola tabla para ventas, compras y asientos | `addons/account/models/account_move.py:81,151-165` |
| `hr.employee` / `hr.version` / `hr.leave` / `hr.leave.allocation` | empleado con `user_id`, `parent_id`, `company_id`, `version_id`; ausencias y asignaciones; plan de acumulación | empleado a usuario, jefe y versión contractual | `addons/hr/models/hr_employee.py:44-147,286`; `addons/hr_holidays/models/hr_leave.py:47`; `hr_leave_allocation.py:30`; `hr_leave_accrual_plan.py:12` |
| `base.automation` | `model_id`, `trigger` (crear, editar, etapa, usuario, etiqueta, por fecha, mensaje, webhook), acciones del servidor | regla a modelo y acciones | `addons/base_automation/models/base_automation.py:129-182` |

## Decisiones de diseño que se notan y su porqué

- **Todo es módulo, también lo transversal.** Chatter, actividades, importación, automatización, portal y analítica son módulos con su propio manifiesto. Porqué: cada cliente instala solo lo que usa y el núcleo no carga lo que no se pidió. Se nota en que `crm` enumera once dependencias (`addons/crm/__manifest__.py:11-23`) en lugar de incluir esas funciones.
- **Módulo técnico y módulo app por separado.** `sale` guarda modelos; `sale_management` es lo que el usuario instala (`addons/sale_management/__manifest__.py:38,65`). Otros módulos pueden depender del modelo sin arrastrar la interfaz.
- **Los puentes no viven en ninguno de los dos módulos.** `purchase` no depende de `stock` ni `stock` de `account` (`addons/purchase/__manifest__.py:10`, `addons/stock/__manifest__.py:8`). La integración se resuelve con módulos que se autoinstalan al coexistir ambos (patrón visible en `l10n_co`, `addons/l10n_co/__manifest__.py:14`). Porqué: evita que una app obligue a instalar la otra y evita ciclos.
- **Funciones opcionales como grupos, no como módulos.** Lotes, paquetes, descuentos, leads e ingresos recurrentes son grupos que se activan con un interruptor de ajustes (`addons/stock/models/res_config_settings.py:13-30`, `addons/crm/models/res_config_settings.py:14-15`). Es más barato que un módulo (sin cambio de esquema) y oculta pantallas sin quitar tablas.
- **Jerarquía de roles por `implied_ids`, no por niveles numéricos.** Cada módulo agrega sus grupos sobre `base.group_user` y se acumulan (`addons/account/security/account_security.xml:58-82`).
- **Permiso y regla fusionados en un registro** `ir.access` con dominio opcional (`odoo/addons/base/models/ir_access.py:64-126`) y una fila CSV por (modelo, grupo) (`addons/crm/security/ir.access.csv:1-5`).
- **Estado del documento como selección corta y avance derivado.** `sale.order.state` tiene 4 valores; el avance real (entregado, facturado) se lee de `invoice_status` y de las cantidades por línea (`addons/sale/models/sale_order.py:26-31,367-371`; `sale_order_line.py:285-338`). Igual en compras con `qty_received` y `qty_invoiced` (`purchase_order_line.py:75-83`).
- **Una sola tabla para todo documento contable.** `account.move` cubre factura de cliente, de proveedor, notas y asientos con `move_type` (`addons/account/models/account_move.py:151-160`). Numeración, impuestos y conciliación se escriben una vez.
- **Localización como datos, por país, autoinstalable.** Plan de cuentas e impuestos de Colombia son CSV más un decorador por país, cargados al coexistir con `account` y un país configurado (`addons/l10n_co/__manifest__.py:5,14`; `template_co.py:7-30`).
- **Existencias como movimientos más saldo por ubicación.** `stock.move` registra el hecho y `stock.quant` guarda la existencia actual por producto, ubicación y lote (`addons/stock/models/stock_quant.py:47-99`; `stock_move.py:59-129`). Proveedor, cliente y ajuste son ubicaciones virtuales (`stock_location.py:33-40`): cada entrada y salida es un movimiento entre dos ubicaciones.

## Adoptable para TailorSuite (lista numerada A1, A2…: la idea, la cita que la respalda, por qué le sirve a una pyme, y el esfuerzo estimado bajo, medio o alto sobre Postgres con RLS y React)

**A1. Registro de módulos en base de datos con estado, dependencias y exclusiones.** Tabla `modulos` (nombre, estado, es app, categoría, secuencia) y tabla de dependencias, rellenadas desde manifiestos versionados en el repo. Cita: `odoo/addons/base/models/ir_module.py:161-335,1047-1075,807-843`. Le sirve porque "módulos a la carta que activa quien instala" necesita un lugar único que diga qué está activo; el shell lee ese registro para armar menú y rutas. Esfuerzo: medio.

**A2. Manifiesto declarativo por módulo.** Un archivo por módulo (JSON o TS) con nombre, resumen, categoría, orden, dependencias, permisos que crea, menús, rutas y datos semilla. Cita: `addons/crm/__manifest__.py:5-71`. Un módulo nuevo (inventario, compras) se agrega sin tocar el shell y el CI valida dependencias. Esfuerzo: bajo.

**A3. Activación con cierre de dependencias.** Al activar un módulo se activan sus dependencias transitivas en una sola transacción y antes de confirmar se detectan exclusiones. Cita: `odoo/addons/base/models/ir_module.py:377-405,407-471`. Quien instala marca "Ventas" y el sistema activa Productos y Facturación sin que tenga que saberlo. Esfuerzo: bajo (función SQL o Netlify Function con recorrido de grafo).

**A4. Módulo técnico separado del módulo visible.** Separar "modelo de ventas" de "app Ventas" para que Cartera o Facturación dependan del modelo sin traer pantallas. Cita: `addons/sale/__manifest__.py:11-15` frente a `addons/sale_management/__manifest__.py:38,65`. Los módulos planeados (facturación, cartera) se cruzan con ventas. Esfuerzo: bajo (convención de carpetas).

**A5. Puentes que se activan solos cuando coexisten dos módulos.** Un manifiesto con `autoInstalar: ['facturacion']` y país opcional. Cita: `addons/l10n_co/__manifest__.py:5,14`; lógica en `odoo/addons/base/models/ir_module.py:416-422`. Compras no obliga a inventario y, si ambos están, se activa la conexión (recepción de mercancía que genera movimiento). Esfuerzo: medio.

**A6. Interruptores de función como banderas en lugar de módulos.** Opciones como "descuento por línea", "lotes y series" o "leads antes de oportunidades" se guardan como banderas por instalación, se consultan en la UI y se editan desde una pantalla de ajustes con convención de nombre. Cita: `odoo/addons/base/models/res_config.py:104-135,208-217`; `addons/stock/models/res_config_settings.py:13-30`; `addons/crm/security/crm_security.xml:3-9`. Modula sin multiplicar módulos ni migraciones. Esfuerzo: bajo.

**A7. Roles acumulativos con herencia explícita y agrupación visual por módulo.** Cada módulo declara sus grupos con `implica` y los agrupa bajo un privilegio ("Contabilidad: Facturación / Administrador"). Cita: `addons/account/security/account_security.xml:39-82`; `addons/hr/security/hr_security.xml:3-24`; `odoo/addons/base/models/res_groups.py:75-80`. El núcleo ya tiene roles y permisos: cada módulo nuevo solo añade filas y el selector de rol queda ordenado. Esfuerzo: medio (tabla de implicación y cierre transitivo para armar políticas RLS).

**A8. Permisos como una fila por (modelo, grupo, operación, filtro).** Tabla única de acceso con operación `crud` y filtro, compilada a políticas RLS al activar el módulo. Cita: `odoo/addons/base/models/ir_access.py:64-126`; ejemplo: el vendedor ve sus leads o los sin asignar y el gerente ve todos (`addons/crm/security/ir.access.csv:2-4`). Los permisos de un módulo se revisan en una tabla corta y se regeneran las políticas. Esfuerzo: alto por el generador de políticas; el patrón "personal frente a todos" es lo más reutilizable.

**A9. Visibilidad de menú ligada a grupo.** Cada entrada de menú declara los grupos que la ven. Cita: `addons/crm/views/crm_menu_views.xml:10-15`. El shell construye el menú desde el registro de módulos filtrado por permisos del usuario. Esfuerzo: bajo.

**A10. Localización Colombia como paquete de datos aparte del módulo contable.** Plan de cuentas (PUC) y tabla de impuestos (IVA, exento, retefuente, reteIVA) cargados al activar contabilidad con país CO, y un tipo de identificación DIAN derivado del `vat`. Cita: `addons/l10n_co/data/template/account.account-co.csv` (802 filas), `account.tax-co.csv`, `addons/l10n_co/models/template_co.py:7-30`, `addons/l10n_co/models/res_partner.py:18-40`. Se estudia la estructura y los códigos de cuenta; no se copian los archivos. Entra al mercado objetivo con contabilidad lista. Esfuerzo: medio. Falta la facturación electrónica DIAN (`l10n_co_edi`, Enterprise, no está en el repo).

**A11. Tercero único para cliente, proveedor y empleado, con rangos en vez de banderas.** Una tabla de partners con `customer_rank` y `supplier_rank`, que se inicializan al crear el tercero desde el contexto cliente o proveedor. Cita: `addons/account/models/partner.py:658-659,874-881`; `odoo/addons/base/models/res_partner.py:326,348,371`. El CRM de TailorSuite ya tiene cuentas persona o empresa: ventas, compras y cartera apuntan a la misma tabla y no se duplican terceros. Esfuerzo: bajo.

**A12. Producto con tipo (bien, servicio, combo) y "controla inventario" como bandera aparte; proveedor por producto con precio, cantidad mínima y plazo.** Cita: `addons/product/models/product_template.py:74-86,138-141`; `addons/product/models/product_supplierinfo.py:14-52`. Un solo catálogo alimenta ventas, compras e inventario y un servicio no genera existencias. Esfuerzo: bajo.

**A13. Inventario como movimientos entre ubicaciones más saldo por ubicación.** Ubicaciones jerárquicas con tipo (interna, proveedor, cliente, ajuste); saldo por producto y ubicación. Cita: `addons/stock/models/stock_location.py:33-40`; `addons/stock/models/stock_quant.py:47-99`; `stock_move.py:59-129`. Una compra o una venta es "mover de proveedor a bodega" y la trazabilidad queda gratis. Esfuerzo: alto (concurrencia y reservas sobre Postgres); la versión mínima sin reservas es medio.

**A14. Estados de documento mínimos y avance por cantidades de línea.** Pedido con 4 estados y banderas de avance (`invoice_status`, cantidades recibidas y facturadas por línea). Cita: `addons/sale/models/sale_order.py:26-31,367-371`; `addons/purchase/models/purchase_order_line.py:75-83`. Modela ventas y compras sin una máquina de estados grande. Esfuerzo: bajo.

**A15. Una sola tabla para documentos contables con `tipo`.** Factura de cliente, de proveedor, notas crédito y asientos en la misma entidad. Cita: `addons/account/models/account_move.py:151-160`. Facturación y cartera leen de un solo lugar y la numeración se resuelve por diario. Esfuerzo: medio.

**A16. Campos personalizados cuya definición cuelga del padre (equipo, categoría, proyecto).** Cita: `addons/project/models/project_task.py:194`; `addons/product/models/product_template.py:248`; `addons/crm/models/crm_lead.py:117`; `odoo/addons/base/models/properties_base_definition.py:7-21`. El CRM ya tiene campos personalizados: extenderlos a productos por categoría reusa el mecanismo. Esfuerzo: medio.

**A17. Reglas de automatización con catálogo cerrado de disparadores.** Crear, editar, etapa, usuario, etiqueta, tiempo desde creación o actualización, mensaje, webhook. Cita: `addons/base_automation/models/base_automation.py:161-182`. Recordatorios y avisos sin programar por cliente; el catálogo cerrado limita la superficie. Esfuerzo: alto si es genérico, medio si se limita a CRM y cartera.

**A18. Etapas de pipeline configurables con `es_ganada`, `plegada` y días para marcar estancamiento.** Cita: `addons/crm/models/crm_stage.py:26-35`. Un CRM de pyme sin construir reglas. Esfuerzo: bajo.

**Mínimo útil para una pyme, en orden de instalación:** `base` y `mail` (chatter y actividades), `contacts`, `product`, `crm`, `sale_management`, `account` con localización (`l10n_co`), `purchase`, `stock`, y `hr` con `hr_holidays` si hay ausencias. `project`, `mrp`, `base_automation` y `portal` son segunda ola. Sale de las dependencias reales: `sale` exige `account_payment` y este arrastra `account` y `portal` (`addons/sale/__manifest__.py:11-15`), `purchase` exige `account` (`addons/purchase/__manifest__.py:10`) y `l10n_co` se autoinstala con `account` (`addons/l10n_co/__manifest__.py:14`). En Odoo no hay ventas sin contabilidad instalada; en TailorSuite sí puede haberlas mientras no se active Facturación.

## No conviene copiar (y por qué)

- **El grafo de dependencias fino de Odoo** (once dependencias en `crm`, `addons/crm/__manifest__.py:11-23`): arrastra módulos de SMS, teléfono, calendario, UTM y tours. En un ERP por instalación conviene un grafo plano y corto.
- **Carga del módulo por reinicio del registro.** Instalar recarga el registro de modelos y reconstruye esquema (`odoo/addons/base/models/ir_module.py:407-471`; `odoo/addons/base/models/res_config.py:162-175`). En Supabase la activación debe ser migración SQL versionada, no recarga en caliente.
- **Multicompañía en cada modelo.** `_check_company_auto` y `company_id` en casi todo (`addons/crm/models/crm_lead.py:99,120`; `addons/sale/models/sale_order.py:48,73`). TailorSuite es una instalación por cliente: sobra.
- **Chatter y seguimiento de cambios como mixin en cada modelo** (`addons/crm/models/crm_lead.py:89-97`; `addons/purchase/models/purchase_order.py:23`). Ya existe auditoría en el núcleo; el mixin trae mensajes, seguidores, alias de correo y adjuntos, un subproducto entero (`addons/mail/__manifest__.py:3-9`).
- **Vistas y menús como XML con herencia.** Es un mecanismo del cliente Odoo; en React se resuelve con componentes y el registro de módulos (A1, A9).
- **Puntuación predictiva de leads** (`addons/crm/models/crm_lead_scoring_frequency.py`; `crm_lead.py:218-222`): requiere volumen de datos y mantenimiento que una pyme no tiene.
- **`hr.version` y acumulación de ausencias** (`addons/hr/models/hr_version.py:27`; `addons/hr_holidays/models/hr_leave_accrual_plan.py:12`): modelan contratos y nómina por país con muchas reglas; si RR. HH. entra, empezar con empleado, departamento y ausencia simple.
- **Fabricación (`mrp`) y rutas multipaso de almacén** (`addons/mrp/__manifest__.py:5-11`; `addons/stock/models/res_config_settings.py:25-26`): complejidad innecesaria en el primer año de una pyme de servicios o comercio.
- **Licencia:** los manifiestos declaran `LGPL-3` (por ejemplo `addons/l10n_co/__manifest__.py:21`). No copiar los CSV del plan de cuentas ni el código de los cargadores.

## No leído o dudoso

- **Falta en el clon el cargador de módulos** (`odoo/modules/loading.py`, `graph.py`, `module.py`): `ir_module.py` importa `odoo.modules.module.Manifest` (`odoo/addons/base/models/ir_module.py:22`) pero el directorio `odoo/odoo/modules` no existe. El orden real de carga y la resolución de `auto_install` en arranque se infieren de `ir_module.py`, no de lectura directa.
- **Módulos referenciados y ausentes:** `sales_team` (define `crm.team` y los grupos `group_sale_salesman`, `group_sale_manager`, `group_sale_salesman_all_leads` que usan `crm` y `sale`), `uom`, `resource`, `digest`, `account_payment`, `account_debit_note`, `base_setup`, `utm`, `calendar`, `sms`, `hr_work_entry`, `hr_calendar`, `web`, `web_tour`, y los puentes `stock_account`, `purchase_stock`, `sale_stock`, `sale_crm`. No se pudo verificar cómo `sale` crea entregas ni cómo `purchase` crea recepciones.
- **`web_studio` y `l10n_co_edi` (Enterprise) no están.** El primero es el constructor visual; el segundo es la facturación electrónica DIAN, crítica para TailorSuite en Colombia y a estudiar en otra fuente (la norma DIAN).
- No se leyeron `mrp`, `project` ni `portal` más allá del manifiesto.
- No se abrieron los XML de vistas ni los `i18n`; lo dicho sobre vistas se apoya en manifiestos, `crm_menu_views.xml` y `res_partner_views.xml`.
- La lectura de `res.company.country_id` para decidir la autoinstalación por país (`ir_module.py:419-422`) no se rastreó más allá de esa función.
