import https from 'https';
import { getDb } from './firebase.service.js';

const MODEL = 'claude-sonnet-5';
// Caché de prompt: escribir cuesta 1.25x la entrada (TTL 5 min), leer 0.1x.
const PRICING = { inputPerMTok: 2.00, outputPerMTok: 10.00, cacheWritePerMTok: 2.50, cacheReadPerMTok: 0.20 };

// Sonnet 5 puede anteponer bloques `thinking` al texto: leer content[0].text
// a ciegas devuelve undefined y deja al cliente sin respuesta (incidente
// ALTORANCHO 2026-09-01). Se juntan sólo los bloques de texto.
function extractText(response) {
  return (response.content ?? [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim();
}

function logUsage(usage, type) {
  if (!usage?.input_tokens && !usage?.cache_read_input_tokens) return;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const costUSD =
    (usage.input_tokens / 1e6) * PRICING.inputPerMTok +
    (cacheWrite / 1e6) * PRICING.cacheWritePerMTok +
    (cacheRead / 1e6) * PRICING.cacheReadPerMTok +
    (usage.output_tokens / 1e6) * PRICING.outputPerMTok;
  getDb().collection('bot-techdi_usage_logs').add({
    service: 'claude',
    model: MODEL,
    inputTokens: usage.input_tokens, // sólo la parte NO cacheada
    cacheWriteTokens: cacheWrite,
    cacheReadTokens: cacheRead,
    outputTokens: usage.output_tokens,
    costUSD: Math.round(costUSD * 1e6) / 1e6,
    type,
    createdAt: new Date(),
  }).catch(err => console.error('[claude] Error logging usage to Firestore:', err.message));
}

function buildEscalationInstructions(areas = []) {
  if (!areas.length) {
    return `
IMPORTANTE — ESCALADA: Si la consulta requiere atención humana y no podés resolverla, usá el marcador [ESCALAR] en una línea separada.

IMPORTANTE — CIERRE: Si la consulta está completamente resuelta, empezá tu respuesta con [CERRAR].
Ejemplo: "[CERRAR] ¡Con mucho gusto! Si necesitás algo más, escribinos cuando quieras."`;
  }

  const lines = areas.map(a => `- [ESCALAR_${a.id.toUpperCase()}] — ${a.description}`).join('\n');

  return `
IMPORTANTE — ESCALADA: Cuando la consulta requiere atención humana, usá UNO de estos marcadores en una línea separada (NUNCA pongas otro texto en esa misma línea):
${lines}

Si la consulta requiere atención humana pero ninguna de las áreas de arriba encaja bien, usá [ESCALAR] sin especificar — no fuerces una de ellas si ninguna es la correcta.

El texto de tu respuesta (antes o después del marcador) es lo que le llega al cliente — avisale que lo derivás y que puede haber una pequeña demora. El marcador es invisible para el cliente.
Ejemplo correcto:
"Dale, te paso con el equipo que te puede ayudar mejor con esto. Puede tardar unos minutos, ¡pero te van a responder enseguida!
[ESCALAR_${areas[0].id.toUpperCase()}]"

IMPORTANTE — CIERRE: Si la consulta está completamente resuelta y el cliente se despidió, empezá tu respuesta con [CERRAR].
Ejemplo: "[CERRAR] ¡Con mucho gusto! Si necesitás algo más, escribinos cuando quieras."
Usá [CERRAR] solo cuando estés seguro de que la conversación terminó.`;
}

function buildTicketInstructions() {
  return `
IMPORTANTE — TICKETS DE SOPORTE: Cuando un cliente describe un problema técnico, un bug, o algo que no funciona bien en un desarrollo/sistema que TechDI le hizo, conversá primero para juntar un título breve y una descripción clara del problema (y si es evidente qué tan urgente es, mejor — si no, no importa). Antes o junto con el marcador, avisale EXPLÍCITAMENTE en tu texto que le estás generando un ticket de soporte — nunca lo hagas en silencio. Recién ahí, en una línea separada (invisible para el cliente), agregá:
[CREAR_TICKET:{"titulo":"...","descripcion":"...","prioridad":"baja|media|alta|urgente"}]
El JSON tiene que ser válido y tener exactamente esas 3 claves. Si todavía no tenés información suficiente para un título/descripción claros, seguí preguntando antes de usar el marcador — nunca lo generes con datos vacíos o inventados.`;
}

function callAnthropicAPIOnce(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          const err = new Error(`Anthropic API ${res.statusCode}: ${data}`);
          err.statusCode = res.statusCode;
          err.retryAfter = res.headers['retry-after'];
          return reject(err);
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Anthropic response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const CLAUDE_MAX_RETRIES = 5;

async function callAnthropicAPI(payload) {
  let lastErr;
  for (let attempt = 1; attempt <= CLAUDE_MAX_RETRIES; attempt++) {
    try {
      return await callAnthropicAPIOnce(payload);
    } catch (err) {
      lastErr = err;
      const retryable = !err.statusCode || err.statusCode === 429 || err.statusCode === 529 || err.statusCode >= 500;
      if (!retryable || attempt === CLAUDE_MAX_RETRIES) throw err;
      const waitMs = err.retryAfter ? parseInt(err.retryAfter, 10) * 1000 : Math.min(1000 * 2 ** (attempt - 1), 15000);
      console.warn(`[claude] Retry ${attempt}/${CLAUDE_MAX_RETRIES} tras error: ${err.message} — esperando ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

export async function generateConversationSummary(messages) {
  if (!messages?.length) return 'Sin mensajes para resumir.';
  const formatted = messages
    .map(m => {
      const who = m.role === 'user' ? 'Cliente' : m.role === 'admin' ? 'Agente' : 'Bot';
      return `${who}: ${m.content ?? ''}`;
    })
    .join('\n');

  const response = await callAnthropicAPI({
    model: MODEL,
    max_tokens: 350,
    system: 'Generás resúmenes breves de conversaciones de atención al cliente en español rioplatense. Respondés SOLO con el resumen, sin encabezados ni listas.',
    messages: [{
      role: 'user',
      content: `Generá un resumen de 2 a 4 oraciones de esta conversación. Incluí: el motivo principal de la consulta y cómo terminó (resuelto, derivado a agente, pendiente).\n\nConversación:\n${formatted}`,
    }],
  });
  logUsage(response.usage, 'summary');
  return extractText(response).trim();
}

export async function generateBotResponse(userMessage, conversationHistory, context = {}) {
  const { knowledgeBase = '', customerContext = null, availableLabels = [], botConfig = {}, imageData = null, areas = [] } = context;

  const systemContent = buildSystemPrompt(botConfig, knowledgeBase, customerContext, availableLabels, areas);
  const messages = buildMessages(conversationHistory, userMessage, imageData);

  const response = await callAnthropicAPI({
    model: MODEL,
    max_tokens: 1024,
    system: systemContent,
    messages,
  });

  logUsage(response.usage, 'bot_reply');
  return extractText(response);
}

function buildSystemPrompt(botConfig = {}, knowledgeBase, customerContext, availableLabels = [], areas = []) {
  const botName = botConfig.botName || 'Asistente';
  const businessName = botConfig.businessName || 'TechDI';
  const personality = botConfig.botPersonality ||
    `Respondés de forma amigable, natural y cercana — como lo haría una persona real del equipo.
Usás un tono cálido y profesional. Nunca robótico ni genérico.
Escribís en español rioplatense (vos, etc.) con claridad.
Si no sabés algo, lo decís honestamente y ofrecés derivar a la persona correcta.
Nunca inventás información sobre servicios, precios, plazos, procesos o links — solo usás los datos que te den. Si algo no está en la información que tenés, lo decís honestamente en vez de inventar o suponer.`;

  let prompt = `Sos el asistente virtual de ${businessName}. Tu nombre es ${botName}.\n${personality}`;
  prompt += buildEscalationInstructions(areas);
  prompt += buildTicketInstructions();
  if (knowledgeBase) {
    prompt += `\n\n--- INFORMACIÓN DE LA EMPRESA ---\n${knowledgeBase}`;
    prompt += `\n\nIMPORTANTE — USO DE ESTA INFORMACIÓN: Es TU ÚNICA fuente de verdad sobre servicios, precios, procesos y políticas. Antes de responder CUALQUIER consulta, revisá esta sección completa primero. Si algo aplica, compartilo directamente aunque el cliente no lo pida explícitamente. Si la consulta no está cubierta acá, NUNCA inventes ni supongas una respuesta — decí que no tenés esa info y ofrecé derivar a alguien del equipo.`;
  }
  if (availableLabels.length) {
    prompt += `\n\n--- ETIQUETAS ---\nDEBÉS etiquetar SIEMPRE esta conversación con al menos 1 etiqueta usando [LABEL:nombre] en tu respuesta (invisible para el cliente).
Etiquetas disponibles: ${availableLabels.join(', ')}.
Si ninguna aplica, creá una nueva con [NEW_LABEL:nombre] (ej: [NEW_LABEL:Consulta técnica]).
Guía:
- [LABEL:Lead] → interesado nuevo, todavía no es cliente.
- [LABEL:Consulta] → preguntas generales sobre servicios o funcionamiento.
- [LABEL:Soporte] → cliente existente con una duda o problema puntual.
- [LABEL:Reclamo] → queja o insatisfacción.
Podés combinar varias etiquetas si aplica.`;
  }

  // Caché de prompt: todo lo de arriba es igual para todos los contactos y va
  // en un bloque cacheado (~10% del costo); lo que depende del contacto va
  // aparte, al final. No meter nada variable en el primer bloque.
  const blocks = [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }];
  if (customerContext) blocks.push({ type: 'text', text: `--- PERFIL DEL CONTACTO ---\n${customerContext}` });
  return blocks;
}

function buildMessages(conversationHistory, newMessage, imageData = null) {
  const messages = [];
  if (conversationHistory?.length) {
    const recent = conversationHistory.slice(-10);
    for (const msg of recent) {
      const role = msg.role === 'user' ? 'user' : 'assistant';
      messages.push({ role, content: msg.content });
    }
  }
  if (imageData) {
    messages.push({
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imageData.mimeType, data: imageData.base64 } },
        { type: 'text', text: newMessage || 'Describí esta imagen en el contexto de la consulta del cliente.' },
      ],
    });
  } else {
    messages.push({ role: 'user', content: newMessage });
  }
  return messages;
}

/**
 * Califica una tanda de negocios encontrados en Google Maps para la
 * prospección. Devuelve, en el mismo orden, `{ fit, score, reason, shortName }`:
 * `shortName` es el nombre limpio para saludar ("Pizzería Don Juan" en vez de
 * "Pizzería Don Juan | Delivery Palermo - Abierto 24hs"), que va como variable
 * de la plantilla. Si Claude devuelve algo que no se puede leer, se marca todo
 * como no calificado en vez de mandar mensajes a ciegas.
 */
export async function qualifyProspects(businesses, { rubro, zona, offer }) {
  if (!businesses?.length) return [];
  const list = businesses.map((b, i) => ({
    i,
    nombre: b.name,
    tipo: b.primaryType ?? null,
    direccion: b.address ?? null,
    web: b.website ?? null,
    rating: b.rating ?? null,
    reseñas: b.reviews ?? 0,
  }));

  const response = await callAnthropicAPI({
    model: MODEL,
    max_tokens: 4000,
    system: `Sos parte del equipo comercial de TechDI, una consultora de tecnología argentina (agentes de IA para WhatsApp e Instagram, agente de pauta para Meta Ads, sistemas a medida, webs y tiendas).
Calificás negocios encontrados en Google Maps para decidir si vale la pena escribirles ofreciendo: ${offer || 'nuestros servicios'}.
Criterios: que sea un negocio real y en funcionamiento del rubro buscado (no una cadena enorme ni una sucursal de una franquicia gigante, no un organismo público, no un particular), y que por su tamaño (reseñas, web) tenga volumen de consultas como para que le sirva.
Respondés SOLO con un array JSON, sin texto alrededor.`,
    messages: [{
      role: 'user',
      content: `Rubro buscado: ${rubro}. Zona: ${zona}.

Negocios:
${JSON.stringify(list, null, 1)}

Para cada uno devolvé {"i": <índice>, "fit": true|false, "score": 1-5, "reason": "<motivo en una frase corta>", "shortName": "<nombre comercial limpio, sin sucursal, slogans ni horarios, máx 40 caracteres>"}.`,
    }],
  });
  logUsage(response.usage, 'prospect_qualify');

  let parsed = [];
  try {
    const text = extractText(response);
    const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
    parsed = JSON.parse(json);
  } catch (err) {
    console.error('[claude] qualifyProspects devolvió JSON inválido:', err.message);
  }
  return businesses.map((b, i) => {
    const r = parsed.find(p => p?.i === i);
    if (!r) return { fit: false, score: 0, reason: 'No se pudo calificar', shortName: b.name };
    return {
      fit: !!r.fit,
      score: Number(r.score) || 0,
      reason: String(r.reason ?? '').slice(0, 200),
      shortName: String(r.shortName || b.name).slice(0, 40).trim(),
    };
  });
}
