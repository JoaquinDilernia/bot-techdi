# Panel "WhatsApp nativo" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar Inicio, Conversaciones y Estadísticas del panel de BOT-TECHDI con el lenguaje visual de WhatsApp, un bot con cara ("TeDi") y animaciones de carga, personalizable por cliente (nombre del bot + color de marca).

**Architecture:** El backend suma dos datos a `GET /api/stats`: `previous` (mismos totales del período anterior) y `byBusinessHours`. Para eso la agregación se extrae a un servicio puro y testeable. El frontend suma tokens globales, un `BrandContext` que lee `/api/config` y pone `--brand`, y piezas compartidas: `BotFace`, `useCountUp`, `useFirstLoad` y `Skeleton`. Sobre eso se rehacen las tres pantallas. La lógica no visual va en helpers puros con tests (resumen de TeDi, nivel de espera, línea de tiempo con avisos de traspaso, feed de actividad, variaciones).

**Tech Stack:** Node ESM + Express + Firestore (server, tests con `node --test`); React 18 + Vite + CSS Modules (client, tests nuevos con Vitest).

**Spec:** `docs/superpowers/specs/2026-10-20-panel-whatsapp-nativo-design.md`. Mockups: `docs/superpowers/specs/mockups/2026-10-20-conversaciones.html` (opción 1) y `docs/superpowers/specs/mockups/2026-10-20-inicio-estadisticas.html`. **Los mockups son la referencia visual**: copiar de ahí colores, tamaños, radios y keyframes.

## Global Constraints

- Tipografía: **Figtree** (Google Fonts, pesos 400/500/600/700/800) reemplaza a Poppins en todo el panel.
- Color de marca por defecto `#0f766e`; verde WhatsApp de mensajes salientes `#d9fdd3`; fondo de chat `#efeae2` con el patrón SVG de dibujitos del mockup; menú lateral `#0f2a2a`.
- Personalización por cliente: `bot_config.botName` (en TechDI, "TeDi") y `bot_config.brandColor` (hex). Ningún componente puede tener fijo el color de marca ni el nombre del bot.
- Contador de espera: **naranja desde 5 min, rojo desde 15 min**.
- Animaciones de entrada **solo en la primera carga** de cada pantalla. Los refrescos por polling actualizan sin reanimar. Con `prefers-reduced-motion: reduce` no hay animaciones de entrada.
- Sin dependencias de runtime nuevas (nada de librerías de gráficos ni de animación). Única dependencia nueva: `vitest` como devDependency del client.
- Mobile tiene que seguir funcionando como hoy (lista ↔ chat en Conversaciones).
- Conversaciones no puede perder ninguna función: filtros/búsqueda, etiquetas, tiempo de espera, cliente insistente/crítico, intervenir/tomar, devolver/enviar al bot, derivar a área/agente, urgente, archivar y archivados, respuestas rápidas, plantillas y aviso de ventana de 24 hs, audio (grabar, cancelar, cortar), adjuntos con arrastrar y soltar, reenviar, citar, buscar en el chat (anterior/siguiente), perfil, notas del equipo, resumen IA, nueva conversación, reintentar envío fallido.
- Copys en español rioplatense (vos).

## Review Focus

1. **Período sin datos** (cliente nuevo o "Hoy" a las 00:05): las variaciones contra un período anterior en 0 muestran "—" (nunca `Infinity`, `NaN` ni "+100%"). Gráficos y anillo vacíos se ven bien, y el globo de TeDi usa el texto de "todavía no entró nadie".
2. **Polling:** Conversaciones refresca cada 5 y 10 s y el Inicio tiene botón de refrescar. Ninguna animación de entrada se vuelve a disparar ni los números vuelven a contar desde 0.
3. **`brandColor` inválido o ausente** en la config ("verde", "", `null`): se usa `#0f766e` y el panel no queda sin color.
4. **Historiales con mensajes viejos sin `sentBy`** o con agentes y bot alternando seguido: un solo aviso por cada cambio real de quien responde, nunca entre dos mensajes del mismo tipo de autor, y los del cliente no cuentan como cambio.
5. **Horario de atención:** el cálculo de "día vs noche" usa la hora de Argentina y respeta `businessDays`. Un sábado a las 11 cuenta como fuera de horario con la config por defecto (lunes a viernes).

---

### Task 1: Backend — agregación extraída + `previous` + `byBusinessHours`

**Files:**
- Create: `server/src/services/businessHours.js`
- Create: `server/src/services/statsAggregate.js`
- Modify: `server/src/routes/stats.routes.js` (handler `GET /`, líneas ~95-365)
- Modify: `server/src/services/bot.service.js:29-43` (`isWithinBusinessHours` delega en el util nuevo)
- Modify: `server/src/routes/config.routes.js` (`getDefaultConfig`: sumar `brandColor: '#0f766e'`)
- Test: `server/src/services/businessHours.test.js`, `server/src/services/statsAggregate.test.js`

**Interfaces:**
- Produces:
  - `isWithinBusinessHoursAt(date: Date, botConfig?: object): boolean`: misma regla que hoy (`businessHoursStart` ?? 9, `businessHoursEnd` ?? 18, `businessDays` ?? [1..5]), evaluada en `America/Argentina/Buenos_Aires` para `date`.
  - `aggregateConversations(conversations, { startMs, endMs, agents, areas, botConfig }): StatsTotals`: devuelve todo lo que hoy calcula el handler a partir de `conversations` (`total`, `conversationsStarted`, `resolved`, `resolvedByBot`, `resolvedByAgent`, `botResolutionRate`, `escalatedCount`, `escalationRate`, `avgFirstResponseMin`, `avgResolutionMin`, `byStatus`, `byChannel`, `byAgent`, `byArea`, `labelCounts`, `dailyTrend`) más `byBusinessHours: { inside: number, outside: number }`, contando por `createdAt` dentro del rango.
  - La respuesta de `GET /api/stats` suma `previous: { total, conversationsStarted, resolvedByBot, resolvedByAgent, botResolutionRate, escalatedCount, escalationRate, avgFirstResponseMin, avgResolutionMin }` y `byBusinessHours`. Todos los campos que existen hoy siguen igual (Stats.jsx actual no se rompe).

- [ ] **Step 1: Escribir los tests que fallan** (`node:test` + `assert`, mismo estilo que `phone.test.js`)

```js
// businessHours.test.js
test('martes 10:00 AR está dentro', () => assert.equal(isWithinBusinessHoursAt(new Date('2026-10-20T13:00:00Z')), true));
test('martes 18:00 AR está fuera (fin exclusivo)', () => assert.equal(isWithinBusinessHoursAt(new Date('2026-10-20T21:00:00Z')), false));
test('martes 08:59 AR está fuera', () => assert.equal(isWithinBusinessHoursAt(new Date('2026-10-20T11:59:00Z')), false));
test('sábado 11:00 AR está fuera con config por defecto', () => assert.equal(isWithinBusinessHoursAt(new Date('2026-10-24T14:00:00Z')), false));
test('sábado 11:00 AR está dentro si businessDays incluye 6', () => assert.equal(isWithinBusinessHoursAt(new Date('2026-10-24T14:00:00Z'), { businessDays: [1,2,3,4,5,6] }), true));

// statsAggregate.test.js — conversaciones armadas a mano con createdAt/resolvedAt/status/messages
test('byBusinessHours separa por createdAt dentro del rango', ...)   // 2 dentro, 1 fuera → { inside: 2, outside: 1 }
test('conversación creada fuera del rango no cuenta en byBusinessHours', ...)
test('sin conversaciones devuelve ceros y botResolutionRate 0, sin NaN', ...) // assert.equal(r.total, 0); assert.equal(r.botResolutionRate, 0); assert.deepEqual(r.byBusinessHours, { inside: 0, outside: 0 })
test('resolvedByBot y resolvedByAgent coinciden con la lógica actual', ...) // 1 resuelta sin mensajes admin → bot; 1 con admin → agente
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd server && npm test`
Expected: FAIL. Los módulos `businessHours.js` y `statsAggregate.js` no existen.

- [ ] **Step 3: Implementar `isWithinBusinessHoursAt` en `businessHours.js`**: convertir `date` a la hora de Argentina con `toLocaleString('en-US', { timeZone })`, igual que hoy. `bot.service.js` pasa a `isWithinBusinessHours = cfg => isWithinBusinessHoursAt(new Date(), cfg)` y no cambia su comportamiento.

- [ ] **Step 4: Implementar `aggregateConversations` en `statsAggregate.js`** moviendo la lógica del handler (todo lo que depende de `conversations`, `startMs` y `endMs`). Lo que es "ahora mismo" (`urgentCount`, `awaitingAgent`, `oldestAwaitingMin`, `pending`) queda en el handler. El handler llama a `aggregateConversations` dos veces: con el rango actual y con el anterior. El rango anterior tiene la misma duración y termina en `start - 1 ms`, y se obtiene con una segunda query a Firestore con el mismo filtro `updatedAt`. Lee `bot_config` para pasar `botConfig`.

- [ ] **Step 5: Correr los tests**

Run: `cd server && npm test`
Expected: PASS (incluido `phone.test.js`).

- [ ] **Step 6: Verificar contra datos reales**

Run: `cd server && node -e "..."` o `curl` a `/api/stats?period=week` con un token local.
Expected: la respuesta trae `previous` y `byBusinessHours`, y los campos viejos tienen los mismos valores que antes del cambio. Comparar `total`, `resolvedByBot` y `dailyTrend` con `git stash` si hace falta.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/businessHours.js server/src/services/businessHours.test.js server/src/services/statsAggregate.js server/src/services/statsAggregate.test.js server/src/routes/stats.routes.js server/src/services/bot.service.js server/src/routes/config.routes.js
git commit -m "feat(stats): período anterior y día vs noche; agregación extraída y testeada"
```

---

### Task 2: Client — fundación (tokens, Figtree, marca, piezas compartidas, menú)

**Files:**
- Modify: `client/package.json` (devDependency `vitest`, script `"test": "vitest run"`)
- Modify: `client/index.html` (link de Google Fonts a Figtree en lugar de Poppins)
- Modify: `client/src/styles/global.css` (tokens nuevos; ver abajo)
- Create: `client/src/lib/brand.js`, `client/src/lib/brand.test.js`
- Create: `client/src/contexts/BrandContext.jsx`
- Create: `client/src/components/ui/BotFace.jsx` + `BotFace.module.css`
- Create: `client/src/components/ui/Skeleton.jsx` + `Skeleton.module.css`
- Create: `client/src/hooks/useCountUp.js`, `client/src/hooks/useFirstLoad.js`
- Create: `client/src/lib/motion.js`, `client/src/lib/motion.test.js`
- Modify: `client/src/App.jsx` (envolver con `BrandProvider` dentro de la sesión)
- Modify: `client/src/components/Layout/Layout.jsx` + `Layout.module.css` (estilo nuevo del menú)
- Modify: `client/src/pages/Config.jsx` (campo "Color de marca": `<input type="color">` + hex, guarda `brandColor`)

**Interfaces:**
- Produces:
  - `normalizeHex(value: unknown, fallback = '#0f766e'): string`: devuelve `#rrggbb` en minúscula; acepta `#rgb`; cualquier otra cosa → `fallback`.
  - `brandVars(hex: string): Record<string,string>`: `{ '--brand': hex, '--brand-soft': <mezcla 88% blanco>, '--brand-ink': <mezcla 35% negro> }`.
  - `useBrand(): { botName: string, brandColor: string, businessName: string }`: `botName` sale de `bot_config.botName` ('TeDi' en TechDI, 'Asistente' si falta); `businessName` sale de `bot_config.businessName ?? 'TechDI'`. El provider pone `brandVars` en `document.documentElement.style`.
  - `<BotFace size={number} tone?="brand"|"light" />`: círculo con dos ojitos que parpadean (keyframes del mockup; sin parpadeo con reduced-motion).
  - `<Skeleton w h radius />`: bloque con shimmer.
  - `easeOutCubic(p: number): number` y `countValue(to: number, elapsedMs: number, durationMs = 1100): number` en `motion.js` (redondeado, clamp a `[0, to]`).
  - `useCountUp(value: number, { animate: boolean }): number`: si `animate` es false devuelve `value` directo; si es true cuenta de 0 a `value` con `countValue`. Si cambia `value` después de la primera animación, salta sin contar.
  - `useFirstLoad(loading: boolean): boolean`: `true` solo durante el primer paso de `loading` a `false` de ese montaje; `false` si `matchMedia('(prefers-reduced-motion: reduce)')`.
  - Tokens en `global.css`: `--wpp-out: #d9fdd3`, `--chat-bg: #efeae2`, `--chat-pattern: url(...)` (SVG del mockup), `--rail: #0f2a2a`, `--ink: #111b21`, `--mute: #667781`, `--line: #e9edef`, `--soft: #f0f2f5`, `--st-wait: #e8473f`, `--st-warn: #f59e0b`, `--st-agent: #6d28d9`, `--st-ok: #16a34a`, `--st-label: #9a6a00`, más las clases de animación `.anim-rise`, `.anim-pop`, `.anim-grow-y`, `.anim-grow-x` y `.anim-draw`, que solo animan bajo un ancestro `.is-entering`. Se mantienen los nombres de variables viejos que usan otras páginas (`--color-*`), remapeados a la paleta nueva para que las pantallas de configuración no se rompan.

- [ ] **Step 1: Agregar vitest y escribir los tests que fallan**

```js
// brand.test.js
expect(normalizeHex('#0F766E')).toBe('#0f766e');
expect(normalizeHex('#abc')).toBe('#aabbcc');
expect(normalizeHex('verde')).toBe('#0f766e');
expect(normalizeHex('')).toBe('#0f766e');
expect(normalizeHex(null)).toBe('#0f766e');
expect(brandVars('#0f766e')['--brand']).toBe('#0f766e');
expect(brandVars('#000000')['--brand-soft']).toMatch(/^#[0-9a-f]{6}$/);
// motion.test.js
expect(countValue(42, 0)).toBe(0);
expect(countValue(42, 1100)).toBe(42);
expect(countValue(42, 5000)).toBe(42);
expect(countValue(42, 550)).toBeGreaterThan(21); // ease-out: pasada la mitad del valor a mitad de tiempo
expect(countValue(0, 500)).toBe(0);
```

- [ ] **Step 2: Verificar que fallan.** Run: `cd client && npm install && npm test`. Expected: FAIL, los módulos no existen.

- [ ] **Step 3: Implementar `brand.js` y `motion.js`.** Run: `npm test`. Expected: PASS.

- [ ] **Step 4: Implementar tokens, Figtree, `BrandContext`, `BotFace`, `Skeleton`, `useCountUp` y `useFirstLoad`; conectar `BrandProvider` en `App.jsx`.**

- [ ] **Step 5: Menú lateral (`Layout`).** Fondo `--rail`, textos claros, ítem activo con fondo blanco y texto `--ink`. Contador rojo de esperando (de `/api/stats?period=day`, campo `awaitingAgent`) en "Conversaciones". El logo es la inicial de `businessName` sobre `--brand`. Se mantienen el colapsado a íconos y el comportamiento mobile.

- [ ] **Step 6: Campo "Color de marca" en Config.** Guarda `brandColor` normalizado; al guardar se actualiza el contexto sin recargar.

- [ ] **Step 7: Verificar en el navegador.** Run: `cd client && npm run dev`. Expected:
  - todas las pantallas cargan con Figtree y la paleta nueva, sin pantallas rotas;
  - cambiar el color en Config cambia `--brand` en vivo;
  - con `brandColor` borrado de Firestore se usa `#0f766e`;
  - `npm run build` termina sin errores.

- [ ] **Step 8: Commit**

```bash
git add client/
git commit -m "feat(panel): tokens WhatsApp nativo, Figtree, color de marca configurable y piezas compartidas"
```

---

### Task 3: Conversaciones — lista, cabecera y píldora de estado

**Files:**
- Modify: `client/src/pages/Conversations.jsx` (lista y cabecera del chat)
- Modify: `client/src/pages/Conversations.module.css`
- Create: `client/src/lib/conversationView.js`, `client/src/lib/conversationView.test.js`
- Delete: `client/src/pages/Conversations.module (Copia en conflicto de JOAQUIN DI LERNIA 2026-09-10).css` (copia de conflicto de Dropbox, sin uso)

**Interfaces:**
- Consumes: `useBrand()`, tokens de la Task 2.
- Produces:
  - `waitLevel(minutes: number|null): 'none'|'ok'|'warn'|'late'`: `null` → `'none'`; `< 5` → `'ok'`; `< 15` → `'warn'`; `≥ 15` → `'late'`.
  - `avatarColor(seed: string): string`: color estable de una paleta de 8 (`#7c3aed`, `#e8473f`, `#0ea5e9`, `#f59e0b`, `#16a34a`, `#db2777`, `#0f766e`, `#6366f1`) según un hash del string.
  - `statusPill(conv, { botName, areaName, agentName }): { text: string, tone: 'bot'|'wait'|'agent'|'ok'|'muted' }`. Reglas:
    - `escalated` sin humanMode → "Esperando · {área}" (`wait`);
    - con humanMode → nombre del agente o "Equipo" (`agent`);
    - `bot` → "{botName} respondiendo" (`bot`);
    - `resolved` → "Resuelta" (`ok`);
    - `bot_archived` → "Archivada" (`muted`).

- [ ] **Step 1: Tests que fallan**

```js
expect(waitLevel(null)).toBe('none'); expect(waitLevel(4.9)).toBe('ok'); expect(waitLevel(5)).toBe('warn');
expect(waitLevel(14.9)).toBe('warn'); expect(waitLevel(15)).toBe('late');
expect(avatarColor('5492994000000')).toBe(avatarColor('5492994000000'));
expect(statusPill({ status: 'bot' }, { botName: 'TeDi' })).toEqual({ text: 'TeDi respondiendo', tone: 'bot' });
expect(statusPill({ status: 'escalated', humanMode: false }, { botName: 'TeDi', areaName: 'Ventas' })).toEqual({ text: 'Esperando · Ventas', tone: 'wait' });
expect(statusPill({ status: 'escalated', humanMode: true }, { botName: 'TeDi', agentName: 'Joaquín' })).toEqual({ text: 'Joaquín', tone: 'agent' });
```

- [ ] **Step 2: Verificar que fallan; implementar `conversationView.js`; verificar que pasan.** Run: `cd client && npm test`.

- [ ] **Step 3: Lista con el estilo del mockup**
  - título "Conversaciones" en 800;
  - buscador gris redondeado;
  - filtros actuales como chips (las pestañas de estado pasan a chips, con contador rojo en "Esperando");
  - ítems con avatar `avatarColor` + punto de canal (WhatsApp `#25d366`, Instagram degradé);
  - la hora o el tiempo de espera usa `waitLevel` (naranja o rojo);
  - debajo de la vista previa, la píldora `statusPill` y la primera etiqueta;
  - se mantienen los indicadores de insistente/crítico, no leídos, urgente, archivados y nueva conversación.

- [ ] **Step 4: Cabecera y píldora de estado**
  - cabecera blanca con avatar, nombre y teléfono · canal; las acciones actuales (buscar en chat, derivar, urgente, archivar, perfil) quedan como botones-ícono con `title` como hoy;
  - debajo, la píldora centrada: si está en manos del bot dice "Responde {botName}" con `<BotFace>` y el botón "Intervenir"; si la tomó un agente, "Lo atiende {agente} · {botName} está en pausa" con "Devolver a {botName}";
  - los botones llaman a los mismos handlers que hoy.

- [ ] **Step 5: Verificar en el navegador** con conversaciones reales:
  - cada filtro y la búsqueda funcionan;
  - intervenir y devolver cambian la píldora;
  - derivar, urgente y archivar siguen funcionando;
  - en mobile se pasa de la lista al chat y se vuelve.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Conversations.jsx client/src/pages/Conversations.module.css client/src/lib/conversationView.js client/src/lib/conversationView.test.js
git rm "client/src/pages/Conversations.module (Copia en conflicto de JOAQUIN DI LERNIA 2026-09-10).css"
git commit -m "feat(conversaciones): lista y cabecera estilo WhatsApp con píldora de estado"
```

---

### Task 4: Conversaciones — chat, avisos de traspaso y composer

**Files:**
- Modify: `client/src/pages/Conversations.jsx` (render de mensajes, `MessageBubble` ~línea 258, composer)
- Modify: `client/src/pages/Conversations.module.css`
- Modify: `client/src/lib/conversationView.js` + test

**Interfaces:**
- Consumes: `useBrand()`, `<BotFace>`, `nameMap` (email → nombre) que ya existe en Conversations.
- Produces:
  - `buildTimeline(messages, { botName, nameMap }): Array<{ kind: 'msg', msg } | { kind: 'handoff', text: string, key: string } | { kind: 'day', label: string, key: string }>`. Reglas:
    - El "responsable" de un mensaje es `'bot'` si `role === 'assistant'`, el `sentBy` (o `'agent'` si falta) si `role === 'admin'`; los de `role === 'user'` no tienen responsable.
    - Se inserta `handoff` antes de un mensaje cuyo responsable difiere del último responsable visto:
      - bot → agente: "{Nombre} tomó la conversación" (nombre de `nameMap[sentBy]`, o "Alguien del equipo");
      - agente → bot: "{botName} volvió a responder".
    - No hay aviso antes del primer responsable de la conversación.
    - Los mensajes de difusión (`content` que empieza con `[Difusión`) no cambian el responsable.
    - Se inserta `day` cuando cambia el día (hora de Argentina): "HOY", "AYER" o "lun 19 oct".

- [ ] **Step 1: Tests que fallan**

```js
const nameMap = { 'j@techdi.com': 'Joaquín' };
const u = c => ({ role: 'user', content: c, timestamp: '2026-10-20T13:00:00Z' });
const b = c => ({ role: 'assistant', content: c, timestamp: '2026-10-20T13:01:00Z' });
const a = (c, s = 'j@techdi.com') => ({ role: 'admin', content: c, sentBy: s, timestamp: '2026-10-20T13:02:00Z' });
const handoffs = msgs => buildTimeline(msgs, { botName: 'TeDi', nameMap }).filter(x => x.kind === 'handoff').map(x => x.text);
expect(handoffs([u('hola'), b('hola!'), u('persona'), a('soy Joaquín')])).toEqual(['Joaquín tomó la conversación']);
expect(handoffs([u('x'), b('y'), a('z'), b('w')])).toEqual(['Joaquín tomó la conversación', 'TeDi volvió a responder']);
expect(handoffs([a('primer mensaje'), u('ok'), a('otro')])).toEqual([]);
expect(handoffs([b('y'), a('z', undefined)])).toEqual(['Alguien del equipo tomó la conversación']);
expect(handoffs([b('y'), a('[Difusión] promo'), b('w')])).toEqual([]);
expect(handoffs([b('y'), u('a'), u('b'), b('z')])).toEqual([]);
```

(Usar el nombre del campo de fecha que de verdad tienen los mensajes en `Conversations.jsx`; si no es `timestamp`, ajustar el fixture.)

- [ ] **Step 2: Verificar que fallan, implementar `buildTimeline` y verificar que pasan.** Run: `cd client && npm test`.

- [ ] **Step 3: Render del chat**
  - fondo `--chat-bg` + `--chat-pattern`;
  - globos entrantes blancos y salientes `--wpp-out`, con radio 9 px, sombra `0 1px .5px #0002`, hora y tildes abajo a la derecha;
  - los del bot llevan arriba "<BotFace size=14/> {botName} · bot" en `--brand`; los de agentes, el nombre en `--st-agent`;
  - avisos `handoff` como píldora amarilla centrada (`#fff8c5`, texto `#5c4a00`), separadores `day` como píldora blanca;
  - se mantienen citar, reenviar, ver imagen, descargar, audio, reintentar envío fallido, búsqueda dentro del chat con resaltado y el aviso de "Fuera de ventana 24 hs".

- [ ] **Step 4: Composer**
  - fondo `--soft`;
  - arriba, chips con las 3 primeras respuestas rápidas (al hacer clic insertan el texto, como el selector actual), y el botón de respuestas rápidas abre el selector completo como hoy;
  - input blanco redondeado, botones de adjuntar, audio y emoji, y enviar en un círculo `--brand`;
  - plantillas cuando la ventana de 24 hs expiró, igual que hoy.

- [ ] **Step 5: Panel derecho (perfil)**
  - avatar grande, nombre y "Cliente desde";
  - "Resumen IA" en caja `--brand-soft`, etiquetas como píldoras, "Notas del equipo" en caja amarilla `#fffbea`;
  - mismas acciones que hoy.

- [ ] **Step 6: Verificar en el navegador** con una conversación que tenga bot, derivación y agente:
  - aparece un aviso por traspaso;
  - enviar texto, adjunto y audio funciona;
  - citar y reenviar funcionan;
  - la búsqueda salta entre resultados;
  - con la ventana vencida se ofrece la plantilla;
  - el polling cada 5 s no duplica avisos ni hace saltar el scroll.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/Conversations.jsx client/src/pages/Conversations.module.css client/src/lib/conversationView.js client/src/lib/conversationView.test.js
git commit -m "feat(conversaciones): chat estilo WhatsApp, firma del bot y avisos de traspaso"
```

---

### Task 5: Inicio

**Files:**
- Modify: `client/src/pages/Dashboard.jsx`, `client/src/pages/Dashboard.module.css`
- Create: `client/src/lib/home.js`, `client/src/lib/home.test.js`

**Interfaces:**
- Consumes:
  - `/api/stats?period=day` (campos `total`, `resolvedByBot`, `escalatedCount`, `awaitingAgent`, `oldestAwaitingMin`, `botResolutionRate`, `avgFirstResponseMin`, `previous`);
  - `/api/stats?period=week` (`dailyTrend`);
  - `/api/conversations`;
  - `useBrand`, `useFirstLoad`, `useCountUp`, `BotFace`, `Skeleton`, `waitLevel`, `avatarColor`.
- Produces:
  - `tediSummary(stats, { botName }): string[]` (1 o 2 mensajes). Copys exactos:
    - si `total === 0`: `['Todavía no entró nadie hoy. Acá te aviso apenas llegue alguien 👀']`;
    - si no, el primer mensaje es `` `Hoy ya atendí ${total} conversaciones y resolví ${resolvedByBot} yo solo 💪` `` (singular "conversación" si `total === 1`);
    - si `escalatedCount > 0`, se suma un segundo mensaje: `` `Te pasé ${escalatedCount} que necesitaban a alguien del equipo.` ``, seguido de `` ` ${awaitingAgent} te están esperando, la más vieja hace ${fmt(oldestAwaitingMin)}.` `` si `awaitingAgent > 0`, o de `' Ya están todas atendidas 🙌'` si no.
  - `waitingQueue(conversations): Array<conv & { waitMin: number }>`: escaladas, sin humanMode, con `waitingSince`, ordenadas por espera de mayor a menor.
  - `activityFeed(conversations, { botName, areaNames }): Array<{ key, icon: 'ok'|'handoff'|'agent'|'bot', title: string, sub: string }>`. Toma las 6 con `updatedAt` más reciente. Reglas:
    - `resolved` → "Se resolvió la conversación con {nombre}";
    - `escalated` sin humanMode → "{botName} derivó a {nombre} a {área}";
    - `escalated` con humanMode → "El equipo atiende a {nombre}";
    - `bot` → "{botName} está hablando con {nombre}";
    - `bot_archived` no se muestra.
    - En todos los casos, `sub` es el tiempo relativo.

- [ ] **Step 1: Tests que fallan**

```js
expect(tediSummary({ total: 0 }, { botName: 'TeDi' })).toEqual(['Todavía no entró nadie hoy. Acá te aviso apenas llegue alguien 👀']);
expect(tediSummary({ total: 42, resolvedByBot: 31, escalatedCount: 8, awaitingAgent: 3, oldestAwaitingMin: 18 }, { botName: 'TeDi' }))
  .toEqual(['Hoy ya atendí 42 conversaciones y resolví 31 yo solo 💪', 'Te pasé 8 que necesitaban a alguien del equipo. 3 te están esperando, la más vieja hace 18 min.']);
expect(tediSummary({ total: 1, resolvedByBot: 1, escalatedCount: 0 }, { botName: 'TeDi' })[0]).toBe('Hoy ya atendí 1 conversación y resolví 1 yo solo 💪');
expect(tediSummary({ total: 5, resolvedByBot: 2, escalatedCount: 3, awaitingAgent: 0 }, { botName: 'TeDi' })[1]).toBe('Te pasé 3 que necesitaban a alguien del equipo. Ya están todas atendidas 🙌');
expect(waitingQueue([...]).map(c => c.id)).toEqual(['viejo', 'nuevo']); // orden por espera desc, excluye humanMode y no escaladas
expect(activityFeed([{ status: 'bot_archived', ... }], ...)).toEqual([]);
```

- [ ] **Step 2: Verificar que fallan, implementar `home.js` y verificar que pasan.**

- [ ] **Step 3: Pantalla**, con la estructura y las medidas del mockup:
  - saludo con "en vivo" y un punto que late;
  - la caja de chat de TeDi sobre el fondo de WhatsApp, que primero muestra "escribiendo…" (3 puntos) unos 800 ms y después los globos de `tediSummary` con pop;
  - 4 KPIs (conversaciones, resolvió el bot %, 1ª respuesta, esperando), cada uno con su variación contra `previous` y su sparkline SVG de `dailyTrend` (`started` para conversaciones, `resolvedByBot/started` para el %, `escalated` para esperando; la 1ª respuesta va sin sparkline si no hay serie diaria);
  - "Te esperan" con `waitingQueue`, contador coloreado por `waitLevel` y botón "Atender", que navega a `/conversations` con esa conversación seleccionada (usar el mecanismo de selección que ya exista; si no existe, un query param que Conversations lea al montar);
  - "Pasando ahora" con `activityFeed`.
  - Las animaciones (esqueleto, escribiendo, globos, conteo, sparklines que se dibujan) corren solo si `useFirstLoad`; el botón de refrescar recarga sin reanimar.

- [ ] **Step 4: Verificar en el navegador:**
  - la primera carga se anima;
  - refrescar no reanima;
  - con DevTools en "prefers-reduced-motion: reduce" no hay animaciones;
  - un cliente sin conversaciones hoy muestra el globo de "todavía no entró nadie" y las variaciones como "—";
  - "Atender" abre la conversación correcta.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Dashboard.jsx client/src/pages/Dashboard.module.css client/src/lib/home.js client/src/lib/home.test.js client/src/pages/Conversations.jsx
git commit -m "feat(inicio): TeDi resume el día, cola de espera y actividad en vivo"
```

---

### Task 6: Estadísticas

**Files:**
- Modify: `client/src/pages/Stats.jsx`, `client/src/pages/Stats.module.css`
- Create: `client/src/lib/statsView.js`, `client/src/lib/statsView.test.js`

**Interfaces:**
- Consumes:
  - `GET /api/stats` con `previous` y `byBusinessHours` (Task 1);
  - `useBrand`, `useFirstLoad`, `useCountUp`, `BotFace`, `Skeleton`;
  - `avatarColor` de la Task 3.
- Produces:
  - `delta(curr: number|null, prev: number|null, { kind: 'pct'|'abs'|'min', goodWhen: 'up'|'down' }): { text: string, good: boolean } | null`:
    - devuelve `null` si `prev` es `null`, `undefined` o `0` (en la UI se muestra "—");
    - `pct` → `` `+${Math.round((curr-prev)/prev*100)}%` `` o `-N%`;
    - `abs` → `+N` o `-N` (para tasas en puntos porcentuales);
    - `min` → `` `-2m` `` o `` `+30s` `` (diferencia de minutos formateada: menos de 1 min en `s`);
    - `good` es true si el cambio va en la dirección de `goodWhen`;
    - si no hubo cambio, `{ text: '=', good: true }`.
  - `stackedDays(dailyTrend): Array<{ label: string, bot: number, team: number }>`:
    - `team = started - resolvedByBot` (mínimo 0);
    - `label` es el día abreviado en español ("Lun", "Mar", "Mié", …) y el día de hoy dice "Hoy".

- [ ] **Step 1: Tests que fallan**

```js
expect(delta(286, 255, { kind: 'pct', goodWhen: 'up' })).toEqual({ text: '+12%', good: true });
expect(delta(74, 0, { kind: 'pct', goodWhen: 'up' })).toBeNull();
expect(delta(5, null, { kind: 'pct', goodWhen: 'up' })).toBeNull();
expect(delta(26, 31, { kind: 'abs', goodWhen: 'down' })).toEqual({ text: '-5', good: true });
expect(delta(8 / 60, 10 / 60, { kind: 'min', goodWhen: 'down' })).toEqual({ text: '-2s', good: true });
expect(delta(10, 10, { kind: 'pct', goodWhen: 'up' })).toEqual({ text: '=', good: true });
expect(stackedDays([{ date: '2026-10-20', started: 10, resolvedByBot: 12 }])[0].team).toBe(0);
```

- [ ] **Step 2: Verificar que fallan, implementar `statsView.js` y verificar que pasan.**

- [ ] **Step 3: Pantalla**, con la estructura del mockup:
  - **Selector de período en chips:** Hoy, 7 días, 30 días, Elegir fechas; el rango personalizado usa el mismo selector de fechas de hoy.
  - **Tarjeta estrella:** degradé radial `#14b8a6 → var(--brand) → #0f2a2a`, con `BotFace` claro, "Resolvió {botName} solo", anillo SVG (r = 40, trazo 10, `stroke-dashoffset` animado), `botResolutionRate` %, "X de Y conversaciones sin que intervenga nadie" y el reparto bot/equipo.
  - **8 tiles con `delta`:** Conversaciones (pct/up), Nuevos contactos (pct/up), Derivadas al equipo (pct/down), Urgentes (abs/down, sin previous: "—"), 1ª respuesta (min/down), Resolución (min/down), Esperando ahora (sin delta) y Tasa de derivación (abs/down).
  - **Barras apiladas por día** con `stackedDays`: bot en `--brand`, equipo en `--brand-soft`.
  - **"Día vs noche":** tarjeta día (degradé `#fff7d6 → #ffe9a8`, sol girando) y tarjeta noche (degradé `#1e2a4a → #0f1630`, luna flotando y estrellas titilando) con `byBusinessHours.inside` y `outside`.
  - **Por canal:** dona SVG con WhatsApp `#25d366` e Instagram `#dd2a7b`.
  - **Por área:** barras horizontales en tonos de `--brand`.
  - **Por agente:** ranking con avatar `avatarColor`, resueltas y respuesta promedio.
  - **Etiquetas:** chips con tamaño de letra de 11,5 a 15 px según la cantidad.
  - **Se mantienen** las secciones y los datos actuales: "Por estado" va como una fila de chips con conteo, y "ver menos/más" en etiquetas.
  - **Animaciones** solo si `useFirstLoad`. Cambiar de período actualiza los números con transición corta (sin esqueleto) y no reanima toda la pantalla.

- [ ] **Step 4: Verificar en el navegador:**
  - los 4 períodos funcionan y "Elegir fechas" respeta el máximo actual;
  - con un período sin datos no aparecen `NaN` ni `Infinity`, y los gráficos quedan vacíos sin romper el layout;
  - reduced-motion funciona;
  - los números coinciden con los de la pantalla actual para el mismo período (compararlos contra `main` antes del cambio).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Stats.jsx client/src/pages/Stats.module.css client/src/lib/statsView.js client/src/lib/statsView.test.js
git commit -m "feat(estadisticas): métrica estrella del bot, día vs noche, variaciones y animaciones"
```

---

### Task 7: Pasada final y entrega

**Files:**
- Modify: según lo que encuentre la pasada (solo ajustes)

- [ ] **Step 1: Recorrer todas las pantallas del menú** (Clientes, Difusiones, Plantillas, Base de conocimiento, Etiquetas, Respuestas rápidas, Áreas, Usuarios, Costos, Proyectos, Tickets, Simulador, Perfil, Config y Login). Expected: ninguna queda rota o ilegible con los tokens nuevos. Ajustar solo lo que se rompió; no rediseñarlas.

- [ ] **Step 2: Cargar "TeDi" como `botName` en la config de TECHDI** desde la pantalla de Config. Es un dato, no código.

- [ ] **Step 3: Tests y build.** Run: `cd server && npm test` y `cd client && npm test && npm run build`. Expected: todo PASS y el build sin errores.

- [ ] **Step 4: Commit y push** (el backend se deploya solo en Railway).

```bash
git add -A client server
git commit -m "chore(panel): ajustes finales del rediseño WhatsApp nativo"
git push
```

- [ ] **Step 5: Avisar al usuario** que tiene que subir `client/dist` a Hostinger, que es manual.
