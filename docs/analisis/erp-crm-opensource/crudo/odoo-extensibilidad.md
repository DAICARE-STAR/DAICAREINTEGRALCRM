# odoo — extensibilidad

Alcance: campos personalizados, modelos (tipos de documento) personalizados, motor de vistas, filtros guardados, personalización por usuario y dónde se guarda esa metadata. Todas las rutas son relativas a `C:\Users\enzov\IA\personal\investigacion-erp\odoo`. Las citas son `ruta:línea` y se verificaron abriendo el archivo. Solo se estudian ideas; no se copia código (licencia LGPL).

## Cómo lo resuelve (hechos, cada uno con su cita ruta/relativa/archivo:línea)

Odoo ofrece dos mecanismos distintos de extensión sin programar, con costos muy diferentes.

**Mecanismo 1: campos personalizados "reales" (ir.model.fields con estado manual).**

1. El catálogo de modelos y campos vive en tablas del propio sistema: `ir.model` (odoo/addons/base/models/ir_model.py:226-228) e `ir.model.fields` (ir_model.py:579-581). Cada fila tiene un `state` que distingue `manual` (creado por el usuario) de `base` (viene del código): ir_model.py:248 y ir_model.py:629.
2. Un campo manual debe llamarse `x_...`. Se impone por restricción de base de datos (ir_model.py:772-775) y por validación del nombre del modelo (ir_model.py:560-566). El prefijo evita choques con los campos que traen los módulos.
3. Crear un campo manual altera el esquema real: al crear, el registro del ORM se reconfigura y se llama a la inicialización de tablas (ir_model.py:1185-1213). Renombrar hace `ALTER TABLE ... RENAME COLUMN` y renombra el índice (ir_model.py:1278-1301). Es decir, el campo es una columna tipada, indexable y con restricciones.
4. Al arrancar, las definiciones manuales se leen de la base en una sola consulta cacheada (`_all_manual_field_data`, ir_model.py:1494-1505) y se convierten en atributos de campo (`_instanciate_attrs`, ir_model.py:1511-1585). Los atributos que se pueden fijar desde datos incluyen: etiqueta, ayuda, índice, copiable al duplicar, requerido, solo lectura, almacenado, dependiente de compañía, dominio de relaciones, tamaño y opciones de selección (ir_model.py:586-660).
5. Los valores de una selección personalizada son filas de otra tabla, `ir.model.fields.selection` (ir_model.py:1736-1739; lectura en ir_model.py:1545), no una cadena dentro del campo.
6. Un campo manual puede ser calculado con código Python en texto, evaluado con `safe_eval` y un entorno limitado (make_compute, ir_model.py:54-58; campo `compute` en ir_model.py:647-653). Esto abre una puerta de ejecución de código desde datos; solo debe darse a administradores.
7. Los campos pueden restringirse por grupo con `groups` (ir_model.py:635) y marcarse como "expandir grupos" en kanban con `group_expand` (ir_model.py:636-642; uso en ir_model.py:1546-1556).

**Mecanismo 2: Properties (campos ligeros en JSON, sin tocar el esquema).**

8. Es un tipo de campo que guarda un solo `jsonb` por registro: `_column_type = ('jsonb', 'jsonb')` (odoo/orm/fields_properties.py:55). La docstring lo explica como personalización ligera: nuevas propiedades "can be created on the fly without changing the structure of the database" (fields_properties.py:34-53).
9. La definición (nombre, tipo, etiqueta, valor por defecto, opciones) no está en cada registro sino en un contenedor, otro registro al que apunta el hijo. Se declara con `definition='team_id.lead_properties_definition'`: ejemplo en CRM (addons/crm/models/crm_lead.py:117-119 y addons/crm/models/crm_team.py:51). Otros usos: producto por categoría (addons/product/models/product_template.py:248, product_category.py:30), tarea por proyecto (addons/project/models/project_task.py:194, project_project.py:174), empleado por compañía (addons/hr/models/hr_employee.py:323, res_company.py:11), lote por producto (addons/stock/models/stock_lot.py:60).
10. Solo se guarda el valor en el hijo, indexado por un identificador interno aleatorio de 16 caracteres (generate_property_name, fields_properties.py:484-486; formato de caché documentado en fields_properties.py:120-127). Al leer se mezcla definición y valor (`_dict_to_list`, fields_properties.py:628-645); los valores cuyo identificador ya no está en la definición se ignoran al leer, no se borran del JSON.
11. Tipos permitidos: boolean, integer, float, text, char, html, date, datetime, monetary, signature, many2one, many2many, selection, tags y separator (fields_properties.py:82-89). Las claves de una definición están restringidas a una lista blanca: name, string, type, comodel, default, suffix, selection, tags, domain, view_in_cards, fold_by_default, currency_field, hidden (fields_properties.py:991-995). La validación completa (nombre único, tipos, opciones sin duplicados, comodelo existente y no transitorio) está en fields_properties.py:1174-1246.
12. La definición se edita desde el mismo formulario de los registros: al escribir una lista con la marca `definition_changed` o `definition_deleted`, el campo actualiza el contenedor (fields_properties.py:288-335). No hay pantalla de configuración aparte; en la vista se usa `widget="properties"` (addons/crm/views/crm_lead_views.xml:543).
13. Los valores por defecto de cada propiedad salen de la definición, y se pueden sobrescribir por contexto con la clave `default_<campo>.<propiedad>` (fields_properties.py:345-403).
14. Se puede filtrar, agrupar y exportar por una propiedad. El filtro se traduce a operadores `jsonb` sobre `campo -> nombre` (condition_to_sql, fields_properties.py:799-895; property_to_sql, fields_properties.py:686-797). La búsqueda de CRM ya ofrece "Agrupar por Propiedades" (addons/crm/views/crm_lead_views.xml:665 y :993). Para tags y many2many el agrupamiento usa un JOIN sobre el arreglo y puede duplicar filas (comentario en fields_properties.py:687-688). La exportación entiende propiedades (odoo/addons/base/models/ir_exports.py:19-40) y la importación también (addons/base_import/models/base_import.py:278, :1751).
15. Hay un caso sin contenedor: `properties.base.definition` guarda una definición única por (modelo, campo) (odoo/addons/base/models/properties_base_definition.py:5-21) y un mixin la inyecta (properties_base_definition_mixin.py:8-54). Lo usa el contacto (odoo/addons/base/models/res_partner.py:275). Para una instalación por cliente es el patrón directo: un solo juego de campos extra por entidad.

**Tipos de documento personalizados.**

16. Un modelo manual es una fila de `ir.model` con prefijo `x_`: por defecto nace con un campo `x_name` (ir_model.py:234-239), tiene orden propio (`order`, ir_model.py:240-241) y al crearse se levanta la tabla y se registra la clase del ORM (ir_model.py:456-466; atributos de la clase en ir_model.py:543-556). Es opcional activarle historial (chatter), actividades y lista negra de correo con tres casillas (addons/mail/models/ir_model.py:12-20), que no se pueden volver a apagar (mail/models/ir_model.py:43-52).
17. Los campos de un modelo manual pueden ser relaciones (many2one, one2many, many2many con tabla `x_..._rel`, ir_model.py:928-936) y la validación impide un one2many sin su many2one inverso (ir_model.py:1190-1205).

**Motor de vistas.**

18. Las vistas son filas de `ir.ui.view` con un XML (arch) guardado en base: tipos list, form, graph, pivot, calendar, kanban, search, card y qweb (odoo/addons/base/models/ir_ui_view.py:157-165); `priority`, `inherit_id`, `mode` primary/extension y `group_ids` (ir_ui_view.py:156, 178, 184-197).
19. Las vistas se personalizan por herencia, no por edición: una vista de extensión apunta a su padre y aplica localizadores xpath. Las extensiones se aplican en un recorrido en profundidad (`_combine`, ir_ui_view.py:986-1062; `apply_inheritance_specs`, ir_ui_view.py:960). La vista por defecto es la primaria con menor prioridad (ir_ui_view.py:705-714).
20. Al crear o editar una vista se valida el XML contra el modelo: campos existentes, atributos y permisos (`_check_xml`, ir_ui_view.py:441; `_validate_view`, ir_ui_view.py:1846; `_postprocess_view`, ir_ui_view.py:1460). Se guarda el arch anterior en `arch_prev` para poder deshacer (ir_ui_view.py:176-177 y :670-671).
21. El resultado se compone en el servidor y se cachea con clave (vista, tipo, móvil, idioma, vistas referenciadas en contexto): get_views en ir_ui_view.py:2981-3052, `_get_view_cache_key` en ir_ui_view.py:3140-3156. El cliente recibe la vista ya combinada junto con los atributos de campo.
22. Una acción de ventana (`ir.actions.act_window`) define qué vistas ofrece: `view_mode` ("list,form"), `view_ids` ordenadas, vista de búsqueda propia, dominio, contexto, límite y `mobile_view_mode` (odoo/addons/base/models/ir_actions.py:243-262, :293-315). La restricción impide modos duplicados (ir_actions.py:282-289). Ejemplo: la acción de oportunidades de CRM enlaza kanban, lista, gráfico, pivote y calendario (addons/crm/views/crm_lead_views.xml:1102-1146).
23. El kanban, el calendario y la lista se declaran por atributos del XML, sin código: kanban con `default_group_by="stage_id"` y creación rápida (addons/crm/views/crm_lead_views.xml:503-504), calendario con `date_start`, `color`, `mode` (crm_lead_views.xml:389). Las columnas del kanban salen de un modelo de etapas editable por el usuario: `crm.stage` con secuencia, "ganada", plegada y días para "pudrirse" (addons/crm/models/crm_stage.py:21-37) y `group_expand` en `stage_id` (addons/crm/models/crm_lead.py:133-136).
24. El motor del lado cliente (JS de lista, formulario, kanban, calendario) no está en este clon: la carpeta `addons/web` no existe. Solo se ven los XML que lo alimentan.

**Filtros guardados y personalización por usuario.**

25. `ir.filters` guarda un filtro de búsqueda como datos: nombre, dominio (texto), contexto, orden, modelo, `user_ids` (vacío = compartido con todos), `is_default`, `action_id` (vacío = aplica a todas las acciones del modelo), acción embebida y registro padre (odoo/addons/base/models/ir_filters.py:9-42). El dominio se guarda como texto y se lee con `ast.literal_eval`, no con `eval` (ir_filters.py:83-87). Al compartir, se limpian del contexto las claves de valores por defecto del autor (`_sanitize_shared_context`, ir_filters.py:44-50). Hay un índice sobre (modelo, acción, acción embebida, registro) y una restricción de que el orden sea un arreglo JSON (ir_filters.py:29-42). La consulta de filtros visibles es la unión de privados y públicos (ir_filters.py:99-120) y viaja con la carga de vistas (ir_ui_view.py:3046-3050).
26. `ir.ui.view.custom` guarda una versión de la vista por usuario (`ref_id`, `user_id`, `arch`, índice por usuario y vista): ir_ui_view.py:73-84. Cuando alguien edita la vista original se borran las personalizaciones, para que todos vean la actualización (ir_ui_view.py:664-668). El consumidor de esta tabla (tableros) está en el módulo `web`, ausente.
27. `ir.default` guarda valores por defecto de campos elegidos por el usuario, con alcance por usuario, por compañía y por condición, en JSON validado contra el tipo del campo (odoo/addons/base/models/ir_default.py:13-52).
28. `ir.exports` + `ir.exports.line` guardan plantillas de exportación (lista ordenada de campos): ir_exports.py:9-14 y :160-167.
29. `ir.embedded.actions` guarda pestañas o accesos embebidos por pantalla, por usuario o compartidos, con dominio, contexto, grupos y filtros propios (odoo/addons/base/models/ir_embedded_actions.py:8-30). Solo se puede borrar lo que creó un usuario (`_compute_is_deletable`, ir_embedded_actions.py:67-73).
30. `ir.ui.menu`: los menús son datos, con padre, secuencia, grupos y acción (odoo/addons/base/models/ir_ui_menu.py:23-41).

**Automatización sin código.**

31. `base.automation` (addons/base_automation/models/base_automation.py:129-186) permite reglas por modelo con disparadores como "etapa asignada a", "usuario asignado", "etiqueta añadida", "al crear", "al editar", "por fecha", "webhook" y un dominio de filtro. Las acciones son `ir.actions.server` con tipos: actualizar registro, crear registro, duplicar, ejecutar código, webhook y varias (odoo/addons/base/models/ir_actions.py:565-600). Los tipos sin código cubren la mayoría de los casos; "ejecutar código" es la puerta a Python.

## Modelo de datos (tabla: entidad, campos clave, relaciones, cita)

| Entidad | Campos clave | Relaciones | Cita |
|---|---|---|---|
| ir.model | model (x_...), name, order, state (manual/base), abstract, transient, fold_name, is_mail_thread/activity (módulo mail) | 1:N con ir.model.fields, access | odoo/addons/base/models/ir_model.py:226-260; addons/mail/models/ir_model.py:12-20 |
| ir.model.fields | name (x_...), model_id, ttype, field_description, help, required, readonly, index, copied, store, domain, relation, relation_field, compute, depends, groups, group_expand, state | N:1 ir.model; N:M res.groups; 1:N selection_ids | ir_model.py:579-660 |
| ir.model.fields.selection | field_id, value, name, sequence | N:1 ir.model.fields | ir_model.py:1736-1739 |
| Campo Properties (en el hijo) | un jsonb {id16: valor} | apunta al contenedor por many2one | odoo/orm/fields_properties.py:55, :120-127 |
| Campo PropertiesDefinition (en el contenedor) | jsonb: lista de {name, string, type, default, selection, tags, comodel, domain, hidden, ...} | lo leen los hijos | fields_properties.py:977-1003 |
| properties.base.definition | properties_field_id (único), properties_definition | N:1 ir.model.fields | odoo/addons/base/models/properties_base_definition.py:5-21 |
| ir.ui.view | name, model, type, arch_db, inherit_id, mode, priority, group_ids, active, arch_prev | autorreferencia; N:M grupos | odoo/addons/base/models/ir_ui_view.py:146-215 |
| ir.ui.view.custom | ref_id, user_id, arch | N:1 vista; N:1 usuario | ir_ui_view.py:73-84 |
| ir.actions.act_window | res_model, view_mode, view_id, search_view_id, domain, context, limit, mobile_view_mode, group_ids | 1:N act_window.view | odoo/addons/base/models/ir_actions.py:243-315 |
| ir.actions.act_window.view | act_window_id, view_id, view_mode (único por acción) | N:1 acción, N:1 vista | ir_actions.py:390-405 |
| ir.filters | name, model_id, domain, context, sort, user_ids, is_default, action_id, embedded_action_id, embedded_parent_res_id, active | N:M usuarios; N:1 acción | odoo/addons/base/models/ir_filters.py:9-42 |
| ir.default | field_id, user_id, company_id, condition, json_value | N:1 campo, usuario, compañía | odoo/addons/base/models/ir_default.py:13-26 |
| ir.exports / ir.exports.line | name, resource; línea: name (ruta de campo), sequence | 1:N | odoo/addons/base/models/ir_exports.py:9-18, :160-167 |
| ir.embedded.actions | parent_action_id, user_id, domain, context, groups_ids, default_view_mode | 1:N ir.filters | odoo/addons/base/models/ir_embedded_actions.py:8-30 |
| ir.ui.menu | name, parent_id, sequence, group_ids, action | árbol | odoo/addons/base/models/ir_ui_menu.py:23-41 |
| base.automation | model_id, trigger, filter_domain, trg_date_id, action_server_ids | 1:N ir.actions.server | addons/base_automation/models/base_automation.py:129-186 |
| crm.stage | name, sequence, is_won, fold, rotting_threshold_days, requirements | N:M crm.team | addons/crm/models/crm_stage.py:21-37 |

## Decisiones de diseño que se notan y su porqué

- Dos niveles de campo personalizado. Un campo manual es una columna real, con índice, restricciones y relaciones, pero su alta altera la tabla y recarga el registro de modelos (ir_model.py:1185-1213). Properties evita eso guardando JSON. El motivo está declarado en la docstring: personalización ligera sin cambiar el esquema (fields_properties.py:34-53). Se reservan las columnas reales para lo estructural y el JSON para lo que cada cliente o equipo cambia a menudo.
- La definición vive en un contenedor, no en cada registro. Un equipo de ventas, una categoría o un proyecto tienen su propio juego de campos; el valor es lo único que se repite en cada fila (fields_properties.py:49-52). Es un diseño pensado para que distintos grupos de una misma base vean formularios distintos.
- Identificador interno aleatorio en vez de nombre de campo (fields_properties.py:484-486). Renombrar la etiqueta no rompe valores guardados ni filtros; borrar una propiedad deja el dato huérfano pero invisible (fields_properties.py:628-645).
- Lista blanca estricta de claves y tipos en la definición (fields_properties.py:991-995, :1174-1246). El JSON viene del navegador del usuario; sin validación sería un vector de inyección o de datos corruptos. El nombre de propiedad se valida con una expresión alfanumérica antes de entrar a una consulta SQL (fields_properties.py:29-31, :683).
- Vistas como datos más herencia por xpath. Los módulos extienden formularios de otros sin editarlos, y el usuario puede hacer lo mismo con una vista de extensión (ir_ui_view.py:986-1062). Cuesta: el resultado final es difícil de predecir y las extensiones se rompen si el padre cambia.
- Validación al guardar la vista (ir_ui_view.py:441, :1846) y guardar el arch anterior (ir_ui_view.py:176-177): una vista rota bloquea la pantalla para todos, así que hay validación temprana y un "restaurar".
- Filtros guardados como dominio de texto leído con `literal_eval` (ir_filters.py:83-87), nunca `eval`, y con limpieza del contexto al compartir (ir_filters.py:44-50) para que un filtro compartido no arrastre valores por defecto ajenos.
- Las personalizaciones por usuario se invalidan al cambiar la vista base (ir_ui_view.py:664-668): se prefiere coherencia entre usuarios a conservar copias divergentes.
- Los prefijos `x_` aíslan lo del cliente de lo del producto (ir_model.py:772-775): una actualización de módulo no pisa ni borra lo creado por el usuario, porque los campos `base` solo los gestionan los módulos (ir_model.py:1035).
- El ejemplo CRM usa la misma maquinaria que cualquier módulo: etapas editables (`crm.stage`), propiedades por equipo, vistas por acción, filtros por usuario. No hay un camino especial para "lo personalizable".

## Adoptable para TailorSuite (lista numerada A1, A2…: la idea, la cita que la respalda, por qué le sirve a una pyme, y el esfuerzo estimado bajo, medio o alto sobre Postgres con RLS y React)

**A1. Campos personalizados como JSONB con definición separada del valor.** Una columna `jsonb` en cada entidad (cuenta, contacto, producto, factura...) y una tabla de definiciones por entidad; los valores se guardan por identificador interno y no por etiqueta. Cita: odoo/orm/fields_properties.py:55, :120-127, :628-645. Le sirve porque cada pyme pide "un campo más" distinto y TailorSuite despliega una instalación por cliente: se evita una migración por cada campo. Esfuerzo: medio. Con RLS las políticas de la tabla base cubren la columna sin trabajo extra; lo costoso es la UI de edición y la validación.

**A2. Contenedor de definición opcional, con caso global.** Empezar con la definición única por entidad y dejar el "definición por categoría/equipo/proyecto" para cuando haga falta. Cita: odoo/addons/base/models/properties_base_definition.py:5-21 y properties_base_definition_mixin.py:8-54 (en contacto: res_partner.py:275). Una pyme normalmente necesita un solo juego por entidad; el contenedor (categoría de producto, tipo de cliente) puede llegar después. Esfuerzo: bajo para el caso global, medio para el contenedor.

**A3. Lista blanca de tipos y de claves de la definición, validada en el servidor y en la base.** Tipos: texto, número, decimal, booleano, fecha, fecha-hora, moneda, selección, etiquetas, relación a una entidad, separador. Claves: nombre interno, etiqueta, tipo, valor por defecto, opciones, comodelo, dominio, oculto. Cita: fields_properties.py:82-89, :991-995, :1174-1246. Evita que un administrador (o un atacante con sesión) meta estructuras arbitrarias en el JSON. Esfuerzo: bajo (una función SQL o una Netlify Function más un esquema JSON Schema compartido con React).

**A4. Identificador interno estable generado por el sistema y validado antes de usarse en SQL.** 16 caracteres aleatorios alfanuméricos; verificar con expresión regular antes de construir cualquier filtro. Cita: fields_properties.py:29-31, :484-486, :682-684. Permite renombrar etiquetas sin romper datos, filtros guardados ni exportaciones, y protege de inyección. Esfuerzo: bajo.

**A5. Filtro y agrupación por campo personalizado vía operadores JSONB, con índice GIN cuando el volumen lo pida.** Cita: fields_properties.py:799-895 (condiciones), :686-797 (agrupar); la búsqueda de CRM ya ofrece "agrupar por propiedades" (addons/crm/views/crm_lead_views.xml:665). Odoo no crea índice por propiedad; para pymes de decenas de miles de filas basta. Esfuerzo: medio (traducir filtros del front a expresiones `->`/`->>`/`@>` con tipos correctos; las etiquetas múltiples requieren cuidado).

**A6. Edición de la definición desde el mismo formulario del registro, con bandera de cambio.** El administrador añade o quita un campo mientras mira un registro; el cliente marca `definition_changed` y el servidor solo entonces escribe la definición. Cita: fields_properties.py:288-335 y widget en crm_lead_views.xml:543. Le sirve a quien instala o administra sin ir a una pantalla técnica. Esfuerzo: medio (componente React de edición en línea).

**A7. Filtros guardados como datos, con alcance privado o compartido y por pantalla.** Tabla con nombre, entidad, dominio serializado, orden, usuarios (vacío = todos), predeterminado y acción/pantalla (vacío = todas). Cita: odoo/addons/base/models/ir_filters.py:9-42, :99-120. Es la forma más barata de dar "mis vistas" a un equipo comercial. En Postgres con RLS la política es "creador o compartido". Esfuerzo: bajo-medio. Imprescindible: no evaluar el dominio con código libre; representarlo como JSON de condiciones y traducirlo en una función controlada (la razón está en ir_filters.py:83-87).

**A8. Limpiar el contexto al compartir un filtro.** Al marcar un filtro como compartido, quitar los valores por defecto del autor para no filtrar datos o preferencias. Cita: ir_filters.py:44-50. Esfuerzo: bajo.

**A9. Etapas de pipeline como tabla editable con secuencia, "ganada", plegada y umbral de inactividad.** Cita: addons/crm/models/crm_stage.py:21-37, y la agrupación por etapa en kanban (addons/crm/models/crm_lead.py:133-136; kanban en addons/crm/views/crm_lead_views.xml:503-504). La pyme ajusta su embudo sin tocar código; el kanban pasa a ser una vista de lectura de esa tabla. Esfuerzo: bajo si ya existe una columna de etapa; medio con arrastrar y soltar.

**A10. Preferencias de vista por usuario guardadas aparte de la vista base, y borradas si el administrador cambia la base.** En TailorSuite no hace falta XML: basta una fila (usuario, pantalla, columnas visibles, orden, agrupación) con una versión de esquema. Cita: odoo/addons/base/models/ir_ui_view.py:73-84 y :664-668. Mantiene coherencia entre usuarios tras un cambio estructural. Esfuerzo: bajo.

**A11. Definición declarativa de pantallas por entidad: tipos de vista permitidos, vista por defecto, límite, dominio base.** Un registro "pantalla = entidad + vistas ordenadas + filtro base + modo móvil". Cita: odoo/addons/base/models/ir_actions.py:243-315, :390-405. En TailorSuite basta con un registro TypeScript de módulos que declare esto; permite activar vistas (lista, kanban, calendario) por módulo a la carta. Esfuerzo: medio.

**A12. Vistas de lista, kanban y calendario como configuración mínima, no como plantillas libres.** Odoo expresa el calendario con tres atributos (fecha inicio, color, modo) y el kanban con el campo de agrupación (addons/crm/views/crm_lead_views.xml:389, :503-504). Para React: cada tipo de vista recibe una configuración tipada (campo de fecha, campo de color, campo de agrupar) en lugar de un lenguaje de plantilla. Elimina el motor de herencia y sigue permitiendo que el administrador elija "qué campo es la fecha del calendario". Esfuerzo: medio.

**A13. Plantillas de exportación guardadas y valores por defecto por usuario.** Cita: odoo/addons/base/models/ir_exports.py:9-18, :160-167 y odoo/addons/base/models/ir_default.py:13-26. Cubre la necesidad típica de contabilidad ("exportar siempre estas columnas") y de captura ("al crear una cuenta, ciudad = Bogotá"). Esfuerzo: bajo.

**A14. Tipos de documento personalizados limitados a una tabla genérica de registros.** En lugar de crear tablas por cliente, una tabla de "entidades personalizadas" (definición: nombre, campos) y una tabla de registros con JSONB, reutilizando A1. Cita de la idea: Odoo permite modelos `x_` con campo de nombre, orden y casillas de historial/actividad (ir_model.py:234-241; addons/mail/models/ir_model.py:12-20). Le sirve a una pyme que quiere "Visitas técnicas" o "Equipos instalados" sin pedir desarrollo. Esfuerzo: alto si se quiere RLS, auditoría, permisos, relaciones y vistas completas; medio si se limita a una lista con campos y sin relaciones entre tipos propios. Recomendación: posponerlo hasta que A1 y A7 estén probados.

**A15. Reglas de automatización declarativas (disparador + condición + acción tipada) con "ejecutar código" excluido.** Disparadores como etapa asignada, usuario asignado, al crear, al editar y por fecha; acciones: actualizar, crear, notificar, webhook. Cita: addons/base_automation/models/base_automation.py:161-186 y odoo/addons/base/models/ir_actions.py:565-600. Aprovecha el módulo de avisos que ya tiene el núcleo de TailorSuite. Esfuerzo: alto si es general; medio si se limita a 3-4 disparadores y 3 acciones. No pertenece a la primera ola.

## No conviene copiar (y por qué)

- Campos manuales con `ALTER TABLE` en caliente y recarga del registro de modelos (ir_model.py:1185-1213, :1278-1301). En Supabase los cambios de esquema hechos desde la aplicación chocan con migraciones versionadas, RLS y tipos generados; conviene preferir JSONB (A1) y dejar el esquema para migraciones.
- Campos calculados escritos como código Python en datos (ir_model.py:54-58, :647-653). Equivale a ejecución de código por quien edite la configuración. Si hace falta, un conjunto cerrado de fórmulas declarativas.
- Herencia de vistas por xpath sobre XML (ir_ui_view.py:960-1062). Es potente pero frágil y asume un motor de vistas completo; en React es más barato un registro tipado de campos y secciones por pantalla.
- Vistas restringidas por grupo (ir_ui_view.py:184-185) sumadas a reglas de acceso por modelo. Para una pyme basta con permisos por módulo y por campo sensible, que TailorSuite ya tiene.
- Modelo "todo es ir.model": un registro de modelos, campos y acciones que describe el propio ORM. Solo tiene sentido si todo el sistema se genera desde metadata; TailorSuite tiene módulos tipados en TypeScript.
- Contexto como cajón de sastre (`context` en acciones y filtros, ir_actions.py:295-296, ir_filters.py:17). Mezcla preferencias de UI con parámetros de negocio; conviene separarlos.
- Agrupar por propiedad de varios valores duplica filas (comentario en fields_properties.py:687-688). Evitar etiquetas múltiples como criterio de agrupación o aceptarlo explícitamente.
- Dejar los valores huérfanos en las filas cuando se borra una propiedad (fields_properties.py:628-645 los ignora al leer, no los purga). Con datos de salud cifrados o datos personales, TailorSuite debería purgar o anonimizar los valores huérfanos.

## No leído o dudoso

- El motor de vistas del cliente (lista, formulario, kanban, calendario, widget `properties`, editor de filtros, barra de búsqueda, tableros personalizados) no está en el clon: no existe `addons/web` ni el JS de `web.views`. Se leyó solo el lado servidor y los XML. No se pudo verificar cómo se guarda y reaplica la vista personalizada por usuario (ir.ui.view.custom) ni cómo la interfaz arma un dominio a partir de condiciones.
- web_studio (el editor visual de campos, vistas y reglas) es de Enterprise y no está. Lo que hace sin programar (arrastrar campos al formulario, crear modelos desde la interfaz) no se pudo ver; se supone que usa los mismos mecanismos (ir.model.fields manual, ir.ui.view de extensión). Solo hay un comentario sobre campos "de Studio" en ir_model.py:1278-1281.
- l10n_co_edi (factura electrónica) es de Enterprise y no está; no es de esta dimensión.
- No se leyó la capa de seguridad que gobierna quién puede crear campos y vistas (ir.access, grupos de administración). Está fuera de esta dimensión y la cubre odoo-permisos.md.
- No se leyeron las pruebas de Properties ni se midió rendimiento. La afirmación de que no hay índice por propiedad se basa en que fields_properties.py no declara ninguno; no se buscó en todos los módulos.
- No se revisó a fondo el seguimiento de cambios (tracking) de campos manuales: addons/mail/models/ir_model_fields.py:10-21 define un entero `tracking` por campo, sin lectura completa.
- El rango ir_model.py:636-642 (group_expand) y ir_model.py:1546-1556 se citan por lectura parcial; las demás citas se verificaron línea a línea.
