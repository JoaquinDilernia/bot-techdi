# Rediseño del panel: "WhatsApp nativo" (Inicio, Conversaciones, Estadísticas)

Fecha: 2026-10-20 · Repo piloto: BOT-TECHDI (`client/`) · Mockups aprobados: `mockups/2026-10-20-conversaciones.html` (opción 1) y `mockups/2026-10-20-inicio-estadisticas.html`.

## Por qué

El panel funciona, pero tiene el look genérico de "hecho con IA": tarjetas iguales con borde de color, etiquetas en mayúscula chiquita, sombras suaves y Poppins. Todo pesa lo mismo. Es **el producto de TechDI**, el CRM con bot que ya se vendió a 4 clientes y se sigue vendiendo, así que el diseño también es parte de la demo de venta. El competidor directo (Torem) se diferencia porque se siente como WhatsApp y porque el bot "tiene cara". Marketing eligió la dirección **WhatsApp nativo**.

TECHDI es el laboratorio: se hace acá primero y después se lleva a los otros bots (ALTORANCHO, PMC, ENTRENO, Selvaggio, TRANSCOLECTIVO), que comparten la misma base de código.

## Objetivos

- **Una identidad de producto propia**, que en cualquier cliente se reconozca como "el panel de TechDI": el lenguaje visual de WhatsApp (fondo con dibujitos, globos verdes, tildes, avisos amarillos) y un bot con cara.
- **Personalizable por cliente** en pocas cosas: el **nombre del bot** (en TechDI es "TeDi"), un **color de marca** y el nombre del negocio. La estructura y el estilo son los mismos para todos.
- **Inicio:** que diga qué hacer ahora. El bot cuenta el día en un globo de WhatsApp, abajo va la cola de "Te esperan" y al costado lo que va pasando.
- **Conversaciones:** más amigable **sin perder ninguna función**. Se tiene que ver al instante quién atiende (el bot o una persona) y qué respondió el bot.
- **Estadísticas:** que se vea lo que hace el bot, "con vida". La métrica estrella es "Resolvió TeDi solo X%", con animaciones de carga y entrada.
- **Animaciones** en Inicio y Estadísticas: esqueleto mientras carga, números que cuentan hacia arriba, barras que crecen, líneas que se dibujan, el bot "escribiendo…".

## No objetivos (esta etapa)

- Rediseñar las pantallas de configuración (Plantillas, Base de conocimiento, Difusiones, Clientes, Config, etc.). Solo heredan los tokens nuevos (tipografía y colores) y no deben romperse.
- Modo oscuro.
- Llevarlo a los otros bots: va en un trabajo aparte, después de validar en TECHDI.
- Cambiar la lógica del bot o del backend, salvo los datos nuevos que piden las pantallas (ver "Datos").

## Anti-objetivos (aunque funcione, sería un fracaso si…)

- Se pierde alguna función de Conversaciones: filtros, búsqueda, etiquetas, tiempo de espera, intervenir o devolver al bot, derivar a área o agente, urgente, archivar, respuestas rápidas, plantillas fuera de la ventana de 24h, audio, adjuntos, reenviar, citar, buscar en el chat, perfil, notas, resumen IA, nueva conversación o el indicador de "cliente insistente".
- Vuelve el look genérico: tarjetas iguales con borde lateral de color, etiquetas en MAYÚSCULA chiquita, sombras suaves en todo o íconos en circulitos de color.
- Las animaciones molestan en el uso diario: se repiten en cada refresco automático, son lentas o tapan datos.
- El color o el nombre de TechDI quedan fijos en el código y no se pueden cambiar por cliente.

## Restricciones

- Stack actual: React 18 + Vite, CSS Modules, sin librería de componentes ni de gráficos. Se mantiene: las animaciones se hacen con CSS y JS chico, sin dependencias nuevas pesadas.
- El frontend se sube a mano (zip de `client/dist` a Hostinger). El backend se deploya solo en Railway con cada push.
- Tiene que seguir funcionando en mobile, como hoy (el layout ya tiene versión mobile).
- `prefers-reduced-motion`: sin animaciones de entrada; el contenido aparece directo.

## Lo que se decidió (con el usuario)

1. **Dirección visual:** "WhatsApp nativo", opción 1 de los mockups de Conversaciones.
   - Fondo de chat beige con patrón de dibujitos.
   - Mensajes salientes en verde WhatsApp (`#d9fdd3`) con tildes.
   - Cada mensaje del bot va firmado con su carita y su nombre ("TeDi · bot"); los de una persona llevan el nombre del agente.
   - Arriba del chat, una píldora de estado: "Lo atiende Joaquín · el bot está en pausa · [Devolver al bot]", o "Responde TeDi · [Intervenir]".
   - Los eventos (derivó, tomó la conversación) van como aviso amarillo centrado, igual que los avisos de WhatsApp.
   - Lista con avatar de color e indicador de canal (punto verde de WhatsApp o degradé de Instagram), con píldoras de estado de colores ("Esperando · Ventas", "Bot respondiendo", agente asignado o etiqueta).
   - Filtros como chips ("Todas", "Esperando 3", "Bot", "Mías", "Etiqueta ▾").
   - Respuestas rápidas como chips arriba del cuadro de texto.
2. **El bot tiene cara:** un círculo con dos ojitos que parpadean, del color de marca. Aparece en la firma de sus mensajes, en el Inicio y en la tarjeta estrella de Estadísticas.
3. **Inicio:**
   - Saludo y "en vivo" con un punto que late.
   - **Globo de TeDi** sobre el fondo de WhatsApp: primero muestra "escribiendo…" y después 1 o 2 mensajes que resumen el día ("Hoy ya atendí 42 conversaciones y resolví 31 yo solo 💪", "Te pasé 8… 3 te están esperando, la más vieja hace 18 min").
   - 4 números con mini gráfica de los últimos 7 días: conversaciones, resolvió el bot (%), 1ª respuesta y esperando.
   - **"Te esperan":** derivadas sin atender, ordenadas por espera. El contador va en naranja desde 5 min y en rojo desde 15 min, con el botón "Atender".
   - **"Pasando ahora":** feed de actividad reciente (bot resolvió, bot derivó, agente tomó, etiqueta nueva).
4. **Estadísticas:**
   - Selector de período en chips (Hoy, 7 días, 30 días, Elegir fechas).
   - Tarjeta estrella con degradé y anillo animado: "Resolvió TeDi solo 74%, 212 de 286", con el reparto TeDi/equipo.
   - Las 8 métricas actuales en tiles, con su **variación contra el período anterior**.
   - Conversaciones por día apiladas (resolvió el bot vs. atendió el equipo).
   - **Día vs noche (nuevo):** conversaciones dentro y fuera del horario de atención, con sol y luna animados.
   - Por canal (dona), por área (barras horizontales), por agente (ranking con avatar y respuesta promedio) y etiquetas (chips de tamaño proporcional).
5. **Animaciones:** las del mockup (esqueleto, "escribiendo…", globos con rebote, conteo de números, barras, líneas, anillo y dona). Se ejecutan **solo en la primera carga de la pantalla**; los refrescos posteriores actualizan los números sin reanimar.
6. **Tipografía:** Figtree reemplaza a Poppins en todo el panel.

## Datos (backend)

`GET /api/stats` ya devuelve casi todo: `total`, `resolvedByBot`, `resolvedByAgent`, `botResolutionRate`, `awaitingAgent`, `oldestAwaitingMin`, `urgentCount`, `escalatedCount`, `escalationRate`, `avgFirstResponseMin`, `avgResolutionMin`, `byChannel`, `byAgent`, `byArea`, `labelCounts` y `dailyTrend` (por día: `started`, `resolvedByBot`, `resolvedByAgent`, `escalated`).

Hay que agregar:

- **Variación contra el período anterior:** un bloque `previous` con los mismos totales calculados sobre el rango anterior de igual duración. Lo usan los tiles y el Inicio.
- **Día vs noche:** `byBusinessHours: { inside, outside }`, contando las conversaciones iniciadas dentro y fuera del horario de `bot_config` (`businessHoursStart`, `businessHoursEnd`, `businessDays`) en la hora de Argentina. Se reutiliza la lógica de `isWithinBusinessHours` de `bot.service.js`.
- **Inicio:**
  - las mini gráficas usan `dailyTrend` de los últimos 7 días (`period=week`);
  - "Te esperan" sale de `/api/conversations` (derivadas sin atender, con su tiempo de espera, como hoy);
  - "Pasando ahora" se arma con las últimas conversaciones actualizadas y su estado (resuelta por bot, derivada a área, tomada por agente). No hace falta un log de eventos nuevo; si un tipo de evento no se puede inferir, no se muestra.
- **Personalización por cliente:**
  - `bot_config.botName` ya existe (en TechDI hay que cargar "TeDi");
  - se agrega `bot_config.brandColor` (hex, por defecto `#0f766e`), editable en Configuración;
  - el frontend lo aplica como variable CSS `--brand` al cargar.
- **Globo de TeDi:** el texto se arma en el frontend con plantillas sobre los números del día, sin llamar a la IA. Si no hubo conversaciones, dice algo como "Todavía no entró nadie hoy. Acá te aviso apenas llegue alguien 👀".

## Lo que queda a criterio de quien construye

- Cómo organizar los tokens en `global.css` (colores, radios, sombras y la variable `--brand` con sus derivados claros), siempre que los colores de marca no queden fijos en los componentes.
- Cómo partir `Conversations.jsx` (2342 líneas) para el rediseño. Se puede tocar solo el CSS y el markup mínimo necesario o extraer componentes, mientras no se pierda funcionalidad.
- Los íconos exactos (SVG en línea como hoy), los textos de los estados vacíos y los tiempos finos de cada animación.
- Si el chip "Etiqueta ▾" es un dropdown o un popover.

## Decisiones que tomé yo (para revisar)

- **Menú lateral:** el mockup muestra una barra de íconos finita, pero el panel tiene unas 15 secciones y la configuración se usa mucho. Por eso se mantiene el **menú con textos** (ya se puede colapsar a íconos), con el nuevo estilo: fondo verde petróleo oscuro, ítem activo claro y contador rojo de "esperando" en Conversaciones.
- **Logo por cliente:** por ahora es la inicial del negocio sobre el color de marca, sin subir imagen.
- **Umbrales del contador de espera:** naranja a los 5 min y rojo a los 15 min.
- **Colores de estado:** bot en el color de marca, esperando en rojo, agente en violeta, resuelta en verde y etiquetas en ámbar. Reemplazan la paleta de chips actual.
- **Avisos amarillos de eventos en el chat:** hoy no se guardan mensajes de evento, pero cada mensaje guarda su autor (`role`, y `sentBy` en los de agentes). Los avisos se **infieren en el frontend** cuando cambia quién responde: si se pasa del bot a un agente, aparece "Joaquín tomó la conversación"; si se pasa de un agente al bot, "TeDi volvió a responder". No se cambia el backend. El área de la derivación se muestra en la píldora de estado y en la lista, no en el aviso. Si más adelante se quiere el detalle exacto ("derivó a Soporte a las 10:38"), se agrega un mensaje `role: 'event'` en el backend como trabajo aparte.
- **Mensajes viejos sin `sentBy`:** se firman como "Agente", igual que hoy.
- **Orden de trabajo:** primero los tokens y la tipografía (todo el panel se actualiza un poco), después Conversaciones, después Inicio y por último Estadísticas con los datos nuevos del backend.
