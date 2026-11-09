# Guía de interfaz del producto

Reglas de la interfaz del shell y de los módulos. Rigen además `C:\Users\enzov\IA\estandares\ui.md` y las decisiones cerradas (sin emojis, sin párrafos de ayuda, acciones como botones).

| Cómo leer | |
|---|---|
| Quien diseña una vista | Cabeceras, Barra de filtros, Resumen, Estados vacíos |
| Quien programa un módulo | Componentes compartidos y Reglas para agentes |

## Cabeceras

«Icono, título y acciones»: `CabeceraPagina` con el icono del módulo, el título (un solo h1 por vista) y las acciones como hijos, a la derecha; las pestañas debajo. Sin línea de dato bajo el título: un conteo o una fecha va en la primera línea del contenido. Como mucho un botón primario por vista.

## Barra de filtros

`BarraFiltros`: buscador opcional y selects con opción neutra («Estado: todos»). Cinco visibles como máximo; el resto en «Más filtros», que muestra cuántos de dentro están activos. Contador de filtros activos y Limpiar.

## Resumen

`Resumen`: una sola cifra destacada y debajo contadores que suman el total; un contador en cero no se muestra. Un contador puede aplicar o soltar el filtro equivalente (botón con `aria-pressed`).

## Dinero

`Dinero` sobre `moneda.ts`: «CÓDIGO SÍMBOLO importe» (COP $ 50.000.000), miles con punto, «—» sin número. Las divisas nunca se suman: se apilan.

## Estados vacíos y avisos

`EstadoVacio` dice la causa y la siguiente acción; un error de permiso nombra el permiso que falta. `useAvisos()` anuncia en `role=status` y, si es error, en `role=alert`.

## Modales y cajones

`Dialogo` para formularios cortos; `CajonPestanas` para la ficha de un registro: pestañas en dos grupos como máximo, foco atrapado, Escape, el resto de la página inert y confirmación si hay cambios sin guardar (`sucio()`).

## Reglas para agentes

- Usar los componentes compartidos antes de crear uno propio.
- Toda vista nueva lleva su prueba `.render.test.tsx` con `renderEstatico` y las afirmaciones `unH1`, `maxUnaPrimaria`, `sinEmojis` y `botonesConNombre` de `src/test/render.tsx`.
- Los colores salen de los tokens semánticos; ningún valor de color fijo en un componente.
