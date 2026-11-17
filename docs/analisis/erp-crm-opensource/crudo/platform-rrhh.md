# platform — rrhh

Repo: Huly Platform (licencia EPL 2.0 en los modelos de hr). Rutas relativas a `platform/`. Cobertura real: el módulo `hr` es pequeño (departamentos, solicitudes de ausencia, festivos, calendario de personal). No hay contrato, cargo estructurado, asistencia con marcación, nómina ni vacaciones con saldo.

## Cómo lo resuelve (hechos, cada uno con su cita ruta/relativa/archivo:línea)

1. El empleado no es una entidad propia de RR. HH.: es un mixin `Employee` sobre `Person`, que a su vez extiende `Contact`. El mixin añade `active`, `role` (USER o GUEST), `statuses`, `position` (texto libre) y `timezone`, todos de solo lectura y ocultos en la UI. `models/contact/src/index.ts:255-281`.
2. `Contact` solo trae nombre, avatar, canales de contacto, adjuntos, comentarios y ciudad; `Person` añade cumpleaños, identidades sociales y un `personUuid` oculto. Es un modelo genérico de persona, no de plantilla laboral. `models/contact/src/index.ts:129-166` y `models/contact/src/index.ts:210-226`.
3. El rol de RR. HH. se superpone como un segundo mixin, `Staff`, que extiende `Employee` y solo agrega `department`. Un empleado es "plantilla" cuando tiene ese mixin. `models/hr/src/index.ts:109-114`.
4. Un disparador del servidor asigna automáticamente `Staff` con departamento raíz (`hr.ids.Head`) a todo empleado activo que no sea invitado. `server-plugins/hr-resources/src/index.ts:279-303`.
5. El departamento es un árbol por `parent`, con `teamLead`, `managers`, `members` (lista de empleados), `subscribers` (contactos a notificar), canales, adjuntos y comentarios. `models/hr/src/index.ts:70-107`; interfaz en `plugins/hr/src/index.ts:26-38`.
6. Existe un departamento raíz fijo llamado "Organization", creado en la actualización inicial y excluido de la acción de borrado (`_id: { $nin: [hr.ids.Head] }`, y solo si `members.length` es 0). `models/hr/src/migration.ts:40-58`; `models/hr/src/index.ts:348-366`.
7. `Department.members` es un dato derivado y duplicado: un disparador lo mantiene al día sumando al empleado a su departamento y a todos los ancestros, y quitándolo de los antiguos al moverlo. `server-plugins/hr-resources/src/index.ts:104-121` (jerarquía), `:134-162` (empuje y extracción) y `:167-205` (reacción al cambio de `Staff.department`).
8. Al mover un departamento de padre se recalculan los miembros de las cadenas antigua y nueva; al borrarlo se borran los hijos y se limpia el `Staff.department` de sus miembros. `server-plugins/hr-resources/src/index.ts:210-236` y `:241-274`.
9. La migración reconstruye los miembros desde `Staff` recorriendo la jerarquía con protección contra ciclos, lo que confirma que `Staff.department` es la fuente de verdad y `members` una caché. `models/hr/src/migration.ts:108-152`.
10. Ausencias y vacaciones: una `Request` es un documento adjunto al empleado (`attachedTo: Staff`), con `department` copiado, `type`, descripción, fecha de inicio (`tzDate`) y de fin (`tzDueDate`), adjuntos y comentarios. `models/hr/src/index.ts:143-177`.
11. Los tipos de solicitud son datos de modelo, no una tabla editable por el cliente: Vacation, Sick, PTO, PTO2 (medio día), Overtime, Overtime2 (media hora extra) y Remote. Cada uno trae un `value` numérico: -1 resta un día, -0,5 medio día, 1 y 0,5 suman horas extra, 0 no afecta (teletrabajo). `models/hr/src/index.ts:227-309`; tipo en `models/hr/src/index.ts:116-125`.
12. Las fechas usan un tipo propio `TzDate` (año, mes, día y desplazamiento horario) en vez de timestamp, para que un día de ausencia no se corra según la zona. `models/hr/src/index.ts:127-141`; comentario "Date always in UTC" en `plugins/hr/src/index.ts:93-95`.
13. Festivos: `PublicHoliday` con título, descripción, fecha `TzDate` y departamento; se pueden definir por departamento. `models/hr/src/index.ts:179-186`.
14. Permisos de edición del calendario: puede editar las solicitudes de un empleado quien sea `teamLead` o esté en `managers` de su departamento o de uno ascendiente; cada quien edita las propias. Fuera del mes en curso solo el propietario o un administrador. `plugins/hr-resources/src/components/ScheduleView.svelte:120-165` y `plugins/hr-resources/src/components/schedule/MonthView.svelte:188-190`. Es una regla de cliente (Svelte), no de base de datos.
15. Notificaciones: crear, actualizar y borrar solicitud y crear festivo envían correo a los `subscribers` del departamento y de sus ancestros, respetando la preferencia de cada persona. `server-plugins/hr-resources/src/index.ts:336-389` y `:391-425`; tipos de notificación en `models/hr/src/index.ts:429-570`.
16. Asistencia como horas imputadas: no hay entrada y salida. La vista de horarios cruza las solicitudes con `TimeSpendReport` del módulo tracker (empleado, fecha, horas, descripción) para mostrar horas trabajadas por persona y tarea. `plugins/hr-resources/src/components/ScheduleView.svelte:182-215`; `models/tracker/src/types.ts:363-378`.
17. Privacidad: el modelo de HR no separa datos privados. No hay salario, documento de identidad, contrato ni datos bancarios. Lo más cercano es `contact.class.PersonSpace`, un espacio por persona con una referencia a la persona, y un `TxAccessLevel` que permite crear con nivel Guest. `models/contact/src/index.ts:290-295` y `:349-351`. No pude confirmar que se use para datos laborales privados.
18. El proceso de selección vive en otro módulo y comparte persona: `Candidate` es otro mixin sobre `Person` (título, presencial/remoto, fuente, habilidades, reseñas, solicitudes). Un candidato contratado sería la misma `Person` con un mixin más. `models/recruit/src/types.ts:104-143`.
19. `Status` es una entidad adjunta al empleado con nombre y fecha de vencimiento (estados temporales tipo "de viaje hasta"). `models/contact/src/index.ts:246-253`.

## Modelo de datos (tabla: entidad, campos clave, relaciones, cita)

| Entidad | Campos clave | Relaciones | Cita |
|---|---|---|---|
| Contact | name, city, channels, attachments, comments | base de Person y Organization | `models/contact/src/index.ts:129-166` |
| Person | birthday, socialIds, personUuid | extiende Contact | `models/contact/src/index.ts:210-226` |
| Employee (mixin) | active, role, position, timezone, statuses | mixin de Person | `models/contact/src/index.ts:255-281` |
| Status | name, dueDate | adjunta a Employee | `models/contact/src/index.ts:246-253` |
| Staff (mixin) | department | mixin de Employee, apunta a Department | `models/hr/src/index.ts:109-114` |
| Department | name, description, parent, teamLead, managers, members, subscribers | árbol por parent; empleados | `models/hr/src/index.ts:70-107` |
| Request | type, department, description, tzDate, tzDueDate | adjunta a Staff; apunta a RequestType y Department | `models/hr/src/index.ts:143-177` |
| RequestType | label, icon, color, value | catálogo de modelo, 7 filas | `models/hr/src/index.ts:116-125` y `:227-309` |
| PublicHoliday | title, description, date, department | apunta a Department | `models/hr/src/index.ts:179-186` |
| TzDate (tipo) | year, month, day, offset | tipo de atributo | `models/hr/src/index.ts:127-141` |
| TimeSpendReport | employee, date, value, description | adjunta a Issue, apunta a Employee | `models/tracker/src/types.ts:363-378` |
| Candidate (mixin) | title, onsite, remote, source, skills | mixin de Person | `models/recruit/src/types.ts:104-143` |

## Decisiones de diseño que se notan y su porqué

- Persona única con mixins (Person, Employee, Staff, Candidate) en vez de una tabla por rol. Una misma persona puede ser a la vez contacto, candidato, empleado y usuario sin duplicar ni migrar registros. Es la decisión más estructural del repo.
- Dato derivado materializado (`members`) mantenido por disparadores. La interfaz reactiva consulta la lista directamente; el costo es la complejidad de mantenerla (cuatro disparadores y dos migraciones de reconstrucción dan fe de ello, `models/hr/src/migration.ts:154-181`).
- Tipos de ausencia con `value` numérico firmado. Un solo campo permite sumar y restar días sin lógica por tipo. Quedó codificado en el modelo, así que no es configurable por el cliente.
- Fechas de ausencia sin hora ni zona (`TzDate`). Evita el error clásico de una vacación que cae un día antes o después.
- Autorización en el cliente por jerarquía de líderes. Simple, pero débil: nada en el servidor impide editar solicitudes ajenas si el cliente se salta la UI.
- Sin contrato, salario ni nómina. El alcance de HR es planificar presencia y ausencias del equipo, no administrar la relación laboral.
- Alta automática en la plantilla de todo empleado activo (departamento raíz por defecto). Reduce el trabajo de alta, a costa de que cada miembro entra sin decisión explícita.

## Adoptable para TailorSuite (lista numerada A1, A2…: la idea, la cita que la respalda, por qué le sirve a una pyme, y el esfuerzo estimado bajo, medio o alto sobre Postgres con RLS y React)

- A1. Tabla de tipos de ausencia con factor numérico firmado (-1, -0,5, 0, +0,5, +1) y color, editable por la instalación. Cita: `models/hr/src/index.ts:227-309` y `:116-125`. Cada pyme define sus tipos (vacaciones, incapacidad, licencia, compensatorio) y los saldos salen con una suma. Esfuerzo bajo. Mejora sobre el original: tabla de datos, no constante.
- A2. Fechas de ausencia como fecha civil (`date`), nunca `timestamptz` para días completos. Cita: `models/hr/src/index.ts:127-141`. Evita errores de un día. Esfuerzo bajo (en Postgres basta el tipo `date`).
- A3. Persona única con extensiones por rol (tabla `personas` y tablas 1 a 1 `empleado`, `candidato`, `contacto_cuenta`). Cita: `models/contact/src/index.ts:210-226` y `:255-281`; `models/recruit/src/types.ts:104-143`. TailorSuite ya tiene contactos del CRM; reutilizarlos como base del empleado evita duplicar datos y permite pasar un candidato a empleado sin reescribirlo. Esfuerzo medio (toca el modelo del CRM existente).
- A4. Departamento en árbol con `lider`, `gestores` y `suscriptores`, y un nodo raíz fijo no borrable. Cita: `models/hr/src/index.ts:70-107`; `models/hr/src/migration.ts:40-58`. Es la estructura mínima que una pyme necesita para aprobar ausencias y avisar. Esfuerzo bajo.
- A5. Permisos por ascendencia: quien lidera o gestiona un departamento ve y gestiona a los de sus descendientes. Cita: `plugins/hr-resources/src/components/ScheduleView.svelte:120-165`. En TailorSuite se haría con una función SQL recursiva dentro de la política RLS, lo que corrige la debilidad del original (regla solo en cliente). Esfuerzo medio.
- A6. No materializar `members`: derivarlo de `empleado.departamento_id` con consulta recursiva o vista. Cita: la complejidad visible en `server-plugins/hr-resources/src/index.ts:104-274` y `models/hr/src/migration.ts:108-152`. En Postgres no hace falta la caché y se ahorran los disparadores y las reconstrucciones. Esfuerzo bajo; es una decisión de no copiar parte del diseño.
- A7. Festivos por departamento o sede con fecha civil. Cita: `models/hr/src/index.ts:179-186`. Útil en Colombia, donde conviene precargar los nacionales cada año y permitir extras por sede. Esfuerzo bajo.
- A8. Notificar a una lista de suscriptores por departamento (y sus ancestros) al crear, cambiar o borrar una solicitud, respetando la preferencia personal. Cita: `server-plugins/hr-resources/src/index.ts:336-425`. Se conecta al núcleo de avisos que TailorSuite ya tiene. Esfuerzo bajo.
- A9. Horas trabajadas como informe cruzado con ausencias, en vez de reloj de marcación: tomar imputaciones de tiempo por proyecto o tarea y mostrarlas junto al calendario de ausencias. Cita: `plugins/hr-resources/src/components/ScheduleView.svelte:182-215`; `models/tracker/src/types.ts:363-378`. Sirve a pymes de servicios que ya imputan horas y no requiere hardware. Esfuerzo medio (depende de tener un módulo de tareas o proyectos).
- A10. Estados temporales del empleado con fecha de vencimiento (en viaje, en capacitación). Cita: `models/contact/src/index.ts:246-253`. Barato y útil en el directorio. Esfuerzo bajo.
- A11. Calendario mensual por persona y departamento como pantalla principal de RR. HH., con color por tipo, en vez de listas. Cita: `plugins/hr-resources/src/components/ScheduleView.svelte` y `plugins/hr-resources/src/components/schedule/MonthView.svelte`. Es lo que más valor percibido da en una pyme. Esfuerzo medio sobre React.
- A12. Bloqueo de edición de meses pasados salvo propietario o administrador. Cita: `plugins/hr-resources/src/components/schedule/MonthView.svelte:188-190`. Protege saldos ya liquidados. Esfuerzo bajo; en TailorSuite iría en la política RLS o en una función que compruebe la fecha.

## No conviene copiar (y por qué)

- Autorización solo en el cliente (quién edita qué): `plugins/hr-resources/src/components/ScheduleView.svelte:130-132`. En una instalación por cliente con datos laborales debe vivir en RLS.
- Tipos de solicitud fijados en el código del modelo: `models/hr/src/index.ts:227-309`. Una pyme necesita añadir los suyos sin tocar código.
- Alta automática de todo empleado activo en el departamento raíz: `server-plugins/hr-resources/src/index.ts:279-303`. Un ERP con datos laborales requiere alta explícita.
- Arquitectura de transacciones y mixins dinámicos (TxMixin, disparadores sobre el flujo de eventos). Se apoya en el motor propio de Huly (CockroachDB, Redpanda; `ARCHITECTURE_OVERVIEW.md:76-79`) y no se traslada a Postgres con RLS; allí bastan restricciones, vistas y disparadores SQL.
- Miembros materializados en el departamento: ver A6.
- Atributos laborales del empleado ocultos y de solo lectura, con `position` como texto libre: `models/contact/src/index.ts:255-281`. Un cargo debe ser una entidad con catálogo para poder reportar.

## No leído o dudoso

- No encontré en este repo contrato, salario, nómina, saldo de vacaciones ni aprobación de ausencias con flujo. Si existen, no están en `hr`, `contact` ni `tracker`.
- No leí a fondo el motor de permisos y espacios (`core.class.Space`, `TxAccessLevel`) ni el uso real de `PersonSpace` para aislar datos privados: `models/contact/src/index.ts:290-295`. Es el candidato a "datos privados por persona", pero no lo verifiqué.
- No leí el módulo `lead` ni `plugins/calendar` más allá de lo citado; la relación de las solicitudes con eventos de calendario no está confirmada.
- No revisé pruebas ni el resto de `server-plugins/hr-resources` fuera de lo citado.
- El uso de `TimeSpendReport` como fuente de asistencia lo deduje de `ScheduleView.svelte:182-215`; no verifiqué cómo se muestra en pantalla.
