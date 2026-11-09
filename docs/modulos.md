# Módulos del producto

Generado por `tools/producto/documentar-modulos.mjs` desde `src/lib/modulos.ts`. No se edita a mano: se cambia el registro y se vuelve a generar (`--check` comprueba que está al día).

| Slug | Nombre | Estado | Ruta | Depende de | Conectores | Límites | Permisos | Esquema |
|---|---|---|---|---|---|---|---|---|
| nucleo | Núcleo | disponible | / | — | correo | miembros, almacenamiento_mb, retencion_uso_dias | manage_members, manage_roles, manage_connectors, view_credentials, manage_credentials | — |
| ia | IA | disponible | — | — | — | ia_hora_miembro, ia_dia_equipo | — | — |
| calendario | Calendario | disponible | /calendario | — | calendario | — | app_calendario, manage_calendars | 10-calendario.sql |
| chat | Chat | disponible | /chat | — | — | — | app_chat | 11-chat.sql |
| correo | Correo | disponible | /correo | — | correo | buzones | app_correo, view_mail | — |
| proyectos | Proyectos | disponible | /proyectos | — | archivos | — | app_proyectos, edit_projects, delete_projects | 20-proyectos.sql |
| disenos | Diseños | disponible | /disenos | proyectos | — | — | app_disenos | — |
| manuales | Manuales | disponible | /manuales | — | — | — | app_manuales | 13-manuales.sql |
| productos | Productos | disponible | /productos | — | cambio | — | app_productos, manage_products | 22-catalogo.sql |
| directorio | Directorio | disponible | /directorio | — | crm | — | app_directorio, edit_crm | — |
| cotizador | Cotizador | disponible | /cotizador | productos | — | — | app_cotizador | 23-cotizador.sql |
| gerencia | Gerencia | disponible | /gerencia | proyectos | facturacion | — | app_gerencia, view_billing | 26-gerencia.sql |
| licitaciones | Licitaciones | disponible | /licitaciones | — | licitaciones | fuentes | app_licitaciones, edit_tender_offers, delete_tender_offers | 27-licitaciones.sql |
| sitio-web | Sitio web | disponible | /sitio-web | — | — | — | app_sitio-web, manage_blog, manage_projects, manage_brands, manage_notice, manage_leads, view_analytics | 28-sitio-web.sql |
| inventario | Inventario | planeado | /inventario | productos | — | — | app_inventario | — |
| compras | Compras | planeado | /compras | inventario | — | — | app_compras | — |
| ventas | Ventas | planeado | /ventas | cotizador, inventario | — | — | app_ventas | — |
| facturacion | Facturación | planeado | /facturacion | ventas, compras | facturacion | — | app_facturacion | — |
| cartera | Cartera | planeado | /cartera | facturacion | — | — | app_cartera | — |
| contabilidad | Contabilidad | planeado | /contabilidad | facturacion, cartera, inventario | — | — | app_contabilidad | — |
| rrhh | Recursos humanos | planeado | /rrhh | — | — | — | app_rrhh | — |
