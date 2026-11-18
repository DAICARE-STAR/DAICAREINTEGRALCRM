# Módulos del producto

Generado por `tools/producto/documentar-modulos.mjs` desde `src/lib/modulos.ts`. No se edita a mano: se cambia el registro y se vuelve a generar (`--check` comprueba que está al día).

Estado: `disponible` se puede activar con `tools/instalar/modulos.mjs --activar`; `planeado` no, sea un módulo ERP que llega con su fase (PP-DEC-13) o uno cuyo archivo de esquema todavía no existe y queda así hasta portarse (PP-DEC-21).

«Depende de» es una dependencia dura: el módulo lee el modelo del otro y no se activa sin él; `--activar` informa el orden de activación de lo que falta. «Integra con» es una relación blanda (PP-DEC-22): no bloquea la activación y declara el puente que se aplicará cuando los dos módulos estén activos; los puentes llegan con la fase de cada módulo.

| Slug | Nombre | Estado | Ruta | Depende de | Integra con | Conectores | Límites | Permisos | Esquema |
|---|---|---|---|---|---|---|---|---|---|
| nucleo | Núcleo | disponible | / | — | — | correo | miembros, almacenamiento_mb, retencion_uso_dias | manage_members, manage_roles, manage_connectors, view_credentials, manage_credentials, gestionar_series | — |
| ia | IA | disponible | — | — | — | — | ia_hora_miembro, ia_dia_equipo | — | — |
| calendario | Calendario | planeado | /calendario | — | — | calendario | — | app_calendario, manage_calendars | 10-calendario.sql |
| chat | Chat | planeado | /chat | — | — | — | — | app_chat | 11-chat.sql |
| correo | Correo | disponible | /correo | — | — | correo | buzones | app_correo, view_mail | — |
| proyectos | Proyectos | planeado | /proyectos | — | — | archivos | — | app_proyectos, edit_projects, delete_projects | 20-proyectos.sql |
| disenos | Diseños | planeado | /disenos | proyectos | — | — | — | app_disenos | — |
| manuales | Manuales | planeado | /manuales | — | — | — | — | app_manuales | 13-manuales.sql |
| productos | Productos | planeado | /productos | — | — | cambio | — | app_productos, manage_products | 22-catalogo.sql |
| crm | CRM | disponible | /crm | — | — | crm | — | app_crm, edit_crm, exportar_crm, ver_salud, edit_salud | 21-crm.sql |
| cotizador | Cotizador | planeado | /cotizador | productos | crm | — | — | app_cotizador | 23-cotizador.sql |
| gerencia | Gerencia | planeado | /gerencia | proyectos | — | facturacion | — | app_gerencia, view_billing | 26-gerencia.sql |
| licitaciones | Licitaciones | planeado | /licitaciones | — | proyectos | licitaciones | fuentes | app_licitaciones, edit_tender_offers, delete_tender_offers | 27-licitaciones.sql |
| sitio-web | Sitio web | planeado | /sitio-web | — | — | — | — | app_sitio-web, manage_blog, manage_projects, manage_brands, manage_notice, manage_leads, view_analytics | 28-sitio-web.sql |
| inventario | Inventario | planeado | /inventario | productos | compras, ventas | — | — | app_inventario | — |
| compras | Compras | planeado | /compras | productos, crm | inventario | — | — | app_compras | — |
| ventas | Ventas | planeado | /ventas | productos, crm | cotizador, inventario | — | — | app_ventas | — |
| facturacion | Facturación | planeado | /facturacion | productos, crm | ventas, compras | facturacion | — | app_facturacion | — |
| cartera | Cartera | planeado | /cartera | facturacion | — | — | — | app_cartera | — |
| contabilidad | Contabilidad | planeado | /contabilidad | — | facturacion, cartera, inventario | — | — | app_contabilidad | — |
| rrhh | Recursos humanos | planeado | /rrhh | — | — | — | — | app_rrhh | — |
