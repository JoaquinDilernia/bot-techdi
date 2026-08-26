# Diseño: Módulo de Proyectos + Tickets de Soporte

**Fecha:** 2026-08-26
**Estado:** Aprobado por el usuario en brainstorming, pendiente de plan de implementación.

## Contexto

BOT-TECHDI ya está en producción atendiendo leads y algo de soporte informal por WhatsApp. TechDI empieza a operar como empresa con clientes reales bajo desarrollos a medida, y necesita dejar de manejar el soporte técnico "a mano" dentro de las conversaciones — hoy no hay forma de:

- Saber a qué proyecto/cliente pertenece un número de WhatsApp que escribe.
- Que un problema reportado por un cliente quede como un ítem de trabajo con seguimiento (título, descripción, prioridad, estado, imágenes), en vez de perderse en el historial del chat.
- Que cualquiera del equipo (no solo el desarrollador) pueda cargar un ticket, ya sea porque el bot lo generó automático o porque un agente lo carga a mano.

Este spec cubre dos subsistemas nuevos y relacionados: **Proyectos** (base de datos de clientes/proyectos de TechDI) y **Tickets** (soporte técnico con seguimiento). Los tickets se vinculan a un proyecto cuando el número de contacto es reconocido.

## Alcance — Proyectos

Un Proyecto representa un cliente/desarrollo de TechDI. Puede tener **más de un contacto vinculado** (ej: el dueño de la empresa y un empleado escriben ambos por WhatsApp, los dos caen en el mismo proyecto) — confirmado explícitamente por el usuario como el modelo correcto para clientes B2B.

**Colección:** `bot-techdi_projects`

```
{
  id: string (auto),
  nombre: string,               // nombre del proyecto (ej: "Bot Altorancho")
  empresa: string,               // nombre de la empresa cliente
  descripcion: string,           // opcional, breve
  estado: 'activo' | 'inactivo',
  contactos: [
    { nombre: string, telefono: string, email: string }
  ],
  contactPhones: string[],       // denormalizado — mismos teléfonos que en `contactos`,
                                  // plano, solo para poder hacer
                                  // `.where('contactPhones', 'array-contains', phone)`
                                  // (Firestore no permite buscar por un campo dentro de
                                  // objetos anidados en un array)
  createdAt: Timestamp,
  updatedAt: Timestamp,
}
```

**Panel — página `Proyectos`:** CRUD simple (listar, crear, editar, gestionar contactos vinculados alta/baja), mismo patrón de UI que la página `Areas` ya existente (lista + formulario de edición inline). Visible para todo el equipo; alta/baja de proyectos requiere rol `admin` o `atencion_cliente` (mismo criterio que ya se usa para Áreas/Departamentos — `operador` puede ver pero no editar).

Toda edición de `contactos` debe regenerar `contactPhones` en el mismo write (server-side, no confiar en que el cliente lo mande sincronizado).

## Alcance — Tickets

**Colección:** `bot-techdi_tickets`

```
{
  id: string (auto),
  titulo: string,
  descripcion: string,
  proyectoId: string | null,     // null si el bot no reconoció el número — se linkea a mano después
  contactId: string | null,      // número de WhatsApp que originó el ticket (null si se creó a mano sin conversación)
  conversationId: string | null, // mismo valor que contactId hoy (1 conversación por contacto) — se guarda
                                  // aparte para no acoplar el modelo de ticket al de conversación
  prioridad: 'baja' | 'media' | 'alta' | 'urgente',
  estado: 'abierto' | 'en_progreso' | 'resuelto' | 'cerrado',
  imagenes: [ { mediaId: string, mimeType: string } ],  // referencias a media de WhatsApp ya recibida
  createdBy: string,             // 'bot' o email del agente que lo cargó a mano
  assignedTo: string,            // email del agente asignado (default: el admin/desarrollador)
  comentarios: [
    { autor: string, texto: string, createdAt: Timestamp }
  ],
  createdAt: Timestamp,
  updatedAt: Timestamp,
  resolvedAt: Timestamp | null,
}
```

**Visibilidad:** todo el equipo ve todos los tickets sin filtro por área (confirmado — a diferencia de Conversaciones, que si filtra por área/rol, soporte técnico no tiene sentido repartirlo así). Cualquier rol autenticado puede crear un ticket a mano desde el panel; cambiar estado/asignación/agregar comentario requiere estar autenticado (sin restricción de rol adicional, ya que "cualquier usuario podría" levantar y dar seguimiento).

**Panel — página `Tickets`:**
- Lista con filtros por estado y prioridad, columna de proyecto vinculado.
- Vista de detalle: título, descripción, imágenes (grid, click para ampliar), selector de estado y de asignado, proyecto vinculado (con link a la ficha del proyecto), link directo a la conversación de origen en `Conversaciones` (si `contactId` existe), y un hilo de comentarios debajo para ir dejando updates de seguimiento.
- Botón "Nuevo ticket" manual (sin conversación de origen) — para cuando Sofía/Agustín/Joaquín detectan algo por fuera del bot.

## Flujo de creación desde el bot

Mismo patrón ya usado para escalada (`[ESCALAR_X]`) y turnos en otros bots de este workspace: se agrega una sección de instrucciones a `buildEscalationInstructions`-adyacente en `claude.service.js` (una nueva `buildTicketInstructions()`) explicando que cuando el cliente describe un problema con el bot/sistema que le hicieron, el asistente debe:

1. Conversar normalmente para juntar **título breve** y **descripción** del problema (y una prioridad estimada si es evidente, si no queda `media` por default).
2. **Antes o junto con** el marcador, decirle explícitamente al cliente que se está generando un ticket (ej: *"Entiendo, te genero un ticket de soporte para que el equipo le dé seguimiento a esto."*) — requisito explícito del usuario: nunca silencioso.
3. Emitir en una línea separada (invisible para el cliente): `[CREAR_TICKET:{"titulo":"...","descripcion":"...","prioridad":"media"}]`

`bot.service.js` agrega un `parseTicketMarker(text)` (mismo estilo que `parseBookingMarker`) en la cadena de parseo de marcadores. Al detectarlo:

1. Busca si `contactId` (el `from` del mensaje) aparece en algún `contactPhones` de `bot-techdi_projects` (`.where('contactPhones', 'array-contains', from)`, sin `orderBy` para no necesitar índice compuesto — mismo criterio ya aplicado en otros bots de este workspace).
2. Si el mensaje que disparó el ticket (o el mensaje de usuario inmediatamente anterior en el historial) era de tipo `image`, toma su `mediaId` y lo agrega a `imagenes`.
3. Crea el ticket (`proyectoId` = el proyecto encontrado o `null`, `contactId`/`conversationId` = `from`, `createdBy: 'bot'`, `estado: 'abierto'`, `assignedTo`: el admin por default — ver Global Constraints del plan para el valor exacto).
4. Envía al cliente una confirmación con el número/id de ticket (ej: *"✅ Ticket creado, en breve el equipo te contacta."*), en el mismo mensaje de salida o inmediatamente después — mismo patrón que la confirmación de turno reservado en otros bots del workspace.

## Notificación automática al cliente (cambio de estado a "resuelto")

Cuando un agente cambia el estado de un ticket a `resuelto` desde el panel, el backend dispara un WhatsApp automático al `contactId` del ticket (si existe) usando `sendWhatsAppTemplate` — **debe ir por plantilla aprobada de Meta**, no por mensaje de texto libre, porque el ticket puede resolverse días después de la última respuesta del cliente (ventana de 24hs cerrada). El usuario confirmó que van a necesitar crear/aprobar esa plantilla en Meta Business Manager antes de que esta parte funcione en producción — mientras tanto se implementa y se prueba en modo local/mock (sin enviar de verdad, o registrando el intento igual que ya hace `survey.service.js` en otros bots del workspace cuando no hay token real configurado).

Nombre de plantilla propuesto: `ticket_resuelto` (parámetro: título del ticket). El código debe leer el nombre de plantilla real desde `bot-techdi_whatsapp_templates` (igual que el resto del sistema de plantillas) — **no hardcodear un nombre fijo**, sino buscar por una plantilla aprobada marcada para este propósito (ver decisión abierta más abajo).

## Decisiones abiertas para la etapa de plan (no bloquean el diseño, pero el plan debe resolverlas explícitamente)

- Cómo se identifica CUÁL plantilla aprobada usar para la notificación de resuelto (¿un campo nuevo `purpose: 'ticket_resolved'` en el modelo de templates, o un nombre fijo `ticket_resuelto` buscado por `name`?). Recomendación: nombre fijo buscado por `name`, más simple y consistente con cómo ya se referencia `sendWhatsAppTemplate(to, templateName, ...)` en el resto del código.
- Valor exacto de `assignedTo` por default al crear un ticket desde el bot (¿el email de Joaquín hardcodeado, o el primer agente con rol `admin`?).
- Si `imagenes` en un ticket creado a mano desde el panel permite subir un archivo nuevo (no solo referenciar media ya recibida por WhatsApp) — el flujo del bot solo referencia `mediaId` existente, pero el botón "Nuevo ticket" manual del panel probablemente necesite su propio upload (reutilizando el mismo patrón de `multer` + endpoint genérico que ya existe para adjuntos en Conversaciones).

## Fuera de alcance de este spec

- Búsqueda/autocompletado inteligente de proyecto al cargar un ticket a mano si el número no está vinculado a ninguno (v1: el campo queda vacío/null, se linkea después manualmente).
- Reportes o dashboards agregados de tickets por proyecto/prioridad (más allá de la lista con filtros).
- Notificaciones automáticas en otros cambios de estado además de `resuelto` (ej: avisar cuando pasa a `en_progreso`) — se puede agregar después reusando la misma plantilla/mecanismo.
- Creación de la plantilla `ticket_resuelto` en Meta Business Manager en sí — es una acción del usuario fuera del código.
