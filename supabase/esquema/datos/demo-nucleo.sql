-- demo-nucleo.sql — Datos de demostración del núcleo. Solo datos (sin DDL):
-- una empresa ficticia, roles de ejemplo y el widget de reloj. No lo aplica
-- el instalador: se corre a mano en el SQL Editor de una instalación de
-- demostración, después de 00 a 09. Cada fila de ejemplo lleva «[demo]» para
-- reconocerla y limpiarla.

begin;

update public.instalacion
   set nombre = 'Ferretería Ejemplo S.A.S. [demo]',
       nombre_corto = 'Ejemplo',
       rubro = 'Ferretería y materiales',
       pais = 'CO',
       locale = 'es-CO',
       zona_horaria = 'America/Bogota',
       moneda_base = 'COP',
       divisas = '{USD}',
       correo_responsable = '',
       contactos = '["Línea de atención [demo]"]'
 where id = 1;

insert into public.roles (name, description, is_system, permissions, position) values
  ('coordinacion', 'Coordina al equipo [demo]', false, '{}', 50),
  ('ventas',       'Equipo comercial [demo]',   false, '{}',                       20)
on conflict (name) do nothing;

insert into public.portal_widgets (id, name, description, sort_order) values
  ('clock', 'Hora mundial', 'Hora local y de otras zonas', 10)
on conflict (id) do nothing;

commit;
