// Catálogo de la prospección: qué rubros buscamos en Google Maps y dónde.
//
// Google Places devuelve como mucho 60 resultados por búsqueda, así que las
// zonas tienen que ser chicas en las ciudades grandes (barrios de CABA,
// localidades del Conurbano, sub-zonas de Córdoba y Rosario) y pueden ser la
// ciudad entera en el interior. Cada combinación rubro × zona es una
// búsqueda; el cron las va rotando día a día.
//
// `tier`: 1 = zona muy poblada/comercial (se busca primero), 2 = ciudad
// mediana, 3 = ciudad chica.

// ─────────────────────────── Grupos (plantilla + qué ofrecemos) ────────────

export const GROUPS = {
  gastronomia: {
    label: 'Gastronomía',
    template: 'prospeccion_gastronomia',
    offer: 'asistente de WhatsApp que toma reservas y pedidos solo y los manda a cocina, más sistema de reservas/take away y panel propio',
  },
  turnos: {
    label: 'Salud, belleza y bienestar',
    template: 'prospeccion_turnos',
    offer: 'asistente de WhatsApp que da, confirma y cancela turnos solo y manda recordatorios, conectado a la agenda',
  },
  comercios: {
    label: 'Comercios y tiendas',
    template: 'prospeccion_comercios',
    offer: 'agente que responde y vende por WhatsApp e Instagram conectado al stock, y agente de pauta que optimiza Meta Ads todos los días',
  },
  servicios: {
    label: 'Servicios y empresas',
    template: 'prospeccion_servicios',
    offer: 'asistente de WhatsApp con IA que responde consultas al instante, filtra interesados y los deriva al equipo con toda la info',
  },
};

// ─────────────────────────── Rubros ────────────────────────────────────────
// [id, etiqueta, texto que se busca en Maps, grupo]

const RUBROS_RAW = [
  // Gastronomía
  ['restaurantes', 'Restaurantes', 'restaurantes', 'gastronomia'],
  ['parrillas', 'Parrillas', 'parrillas', 'gastronomia'],
  ['pizzerias', 'Pizzerías', 'pizzerías', 'gastronomia'],
  ['bares', 'Bares y cervecerías', 'bares y cervecerías', 'gastronomia'],
  ['cafeterias', 'Cafeterías', 'cafeterías', 'gastronomia'],
  ['hamburgueserias', 'Hamburgueserías', 'hamburgueserías', 'gastronomia'],
  ['sushi', 'Sushi', 'sushi', 'gastronomia'],
  ['rotiserias', 'Rotiserías y comida para llevar', 'rotiserías', 'gastronomia'],
  ['heladerias', 'Heladerías', 'heladerías', 'gastronomia'],
  ['panaderias', 'Panaderías y pastelerías', 'panaderías y pastelerías', 'gastronomia'],
  ['catering', 'Catering y eventos', 'catering', 'gastronomia'],

  // Salud, belleza y bienestar (turnos)
  ['centros-medicos', 'Centros médicos y clínicas', 'centros médicos', 'turnos'],
  ['odontologos', 'Consultorios odontológicos', 'consultorios odontológicos', 'turnos'],
  ['kinesiologia', 'Kinesiología y fisioterapia', 'kinesiología', 'turnos'],
  ['nutricionistas', 'Nutricionistas', 'nutricionistas', 'turnos'],
  ['psicologos', 'Psicólogos y centros terapéuticos', 'centros de psicología', 'turnos'],
  ['veterinarias', 'Veterinarias', 'veterinarias', 'turnos'],
  ['estetica', 'Centros de estética', 'centros de estética', 'turnos'],
  ['depilacion', 'Depilación láser', 'depilación láser', 'turnos'],
  ['peluquerias', 'Peluquerías', 'peluquerías', 'turnos'],
  ['barberias', 'Barberías', 'barberías', 'turnos'],
  ['unas', 'Manicuría y uñas', 'manicuría uñas', 'turnos'],
  ['spa', 'Spa y masajes', 'spa masajes', 'turnos'],
  ['gimnasios', 'Gimnasios', 'gimnasios', 'turnos'],
  ['pilates-yoga', 'Pilates y yoga', 'pilates yoga', 'turnos'],
  ['opticas', 'Ópticas', 'ópticas', 'turnos'],

  // Comercios y tiendas
  ['ropa', 'Tiendas de ropa', 'tiendas de ropa', 'comercios'],
  ['calzado', 'Zapaterías', 'zapaterías', 'comercios'],
  ['deportes', 'Artículos deportivos', 'artículos deportivos', 'comercios'],
  ['suplementos', 'Suplementos deportivos y dietéticas', 'suplementos deportivos dietética', 'comercios'],
  ['pet-shops', 'Pet shops', 'pet shop', 'comercios'],
  ['ferreterias', 'Ferreterías', 'ferreterías', 'comercios'],
  ['corralones', 'Corralones y materiales', 'corralón materiales de construcción', 'comercios'],
  ['mueblerias', 'Mueblerías y deco', 'mueblerías', 'comercios'],
  ['colchonerias', 'Colchonerías', 'colchonerías', 'comercios'],
  ['electro', 'Electrodomésticos y tecnología', 'electrodomésticos', 'comercios'],
  ['celulares', 'Celulares y accesorios', 'celulares accesorios', 'comercios'],
  ['perfumerias', 'Perfumerías y cosmética', 'perfumerías', 'comercios'],
  ['jugueterias', 'Jugueterías', 'jugueterías', 'comercios'],
  ['librerias', 'Librerías y papelerías', 'librerías', 'comercios'],
  ['vinotecas', 'Vinotecas', 'vinotecas', 'comercios'],
  ['bicicleterias', 'Bicicleterías', 'bicicleterías', 'comercios'],
  ['viveros', 'Viveros', 'viveros', 'comercios'],
  ['joyerias', 'Joyerías y relojerías', 'joyerías', 'comercios'],

  // Servicios y empresas
  ['inmobiliarias', 'Inmobiliarias', 'inmobiliarias', 'servicios'],
  ['concesionarias', 'Concesionarias y agencias de autos', 'concesionarias de autos', 'servicios'],
  ['talleres', 'Talleres mecánicos', 'talleres mecánicos', 'servicios'],
  ['gomerias', 'Gomerías y lubricentros', 'lubricentro gomería', 'servicios'],
  ['agencias-viajes', 'Agencias de viajes', 'agencias de viajes', 'servicios'],
  ['hoteles', 'Hoteles y cabañas', 'hoteles', 'servicios'],
  ['salones-eventos', 'Salones de eventos', 'salones de eventos', 'servicios'],
  ['institutos', 'Institutos e idiomas', 'institutos de idiomas', 'servicios'],
  ['estudios-contables', 'Estudios contables', 'estudios contables', 'servicios'],
  ['abogados', 'Estudios jurídicos', 'estudios jurídicos', 'servicios'],
  ['seguros', 'Seguros', 'productores de seguros', 'servicios'],
  ['mudanzas', 'Mudanzas y fletes', 'mudanzas fletes', 'servicios'],
  ['lavanderias', 'Lavanderías', 'lavanderías', 'servicios'],
  ['constructoras', 'Constructoras y reformas', 'constructoras reformas', 'servicios'],
];

export const RUBROS = RUBROS_RAW.map(([id, label, query, group]) => ({ id, label, query, group }));

// ─────────────────────────── Zonas ─────────────────────────────────────────
// Cada provincia: `query` es cómo se escribe en la búsqueda de Maps, y cada
// zona es [nombre, tier]. El id de la zona es `<provincia>:<slug>`.

const PROVINCES_RAW = [
  { id: 'caba', name: 'Ciudad de Buenos Aires', query: 'CABA', zones: [
    ['Palermo', 1], ['Belgrano', 1], ['Recoleta', 1], ['Caballito', 1], ['Villa Urquiza', 1], ['Núñez', 1],
    ['Almagro', 1], ['Balvanera', 1], ['San Nicolás', 1], ['Montserrat', 1], ['Flores', 1], ['Villa Crespo', 1],
    ['Colegiales', 1], ['San Telmo', 1], ['Retiro', 1], ['Puerto Madero', 1], ['Villa Devoto', 1], ['Saavedra', 1],
    ['Boedo', 2], ['Barracas', 2], ['La Boca', 2], ['Chacarita', 2], ['Coghlan', 2], ['Constitución', 2],
    ['Floresta', 2], ['La Paternal', 2], ['Liniers', 2], ['Mataderos', 2], ['Monte Castro', 2], ['Nueva Pompeya', 2],
    ['Parque Avellaneda', 2], ['Parque Chacabuco', 2], ['Parque Chas', 2], ['Parque Patricios', 2], ['San Cristóbal', 2],
    ['Vélez Sarsfield', 2], ['Versalles', 2], ['Villa del Parque', 2], ['Villa General Mitre', 2], ['Villa Lugano', 2],
    ['Villa Luro', 2], ['Villa Ortúzar', 2], ['Villa Pueyrredón', 2], ['Villa Real', 2], ['Villa Riachuelo', 3],
    ['Villa Santa Rita', 2], ['Villa Soldati', 3], ['Agronomía', 3],
  ] },
  { id: 'gba-norte', name: 'GBA Zona Norte', query: 'Buenos Aires', zones: [
    ['Olivos', 1], ['Vicente López', 1], ['Florida, Vicente López', 1], ['Munro', 2], ['San Isidro', 1], ['Martínez', 1],
    ['Acassuso', 2], ['Beccar', 2], ['Boulogne', 2], ['San Fernando', 1], ['Victoria, San Fernando', 2], ['Tigre', 1],
    ['Nordelta', 1], ['Don Torcuato', 2], ['General Pacheco', 2], ['Benavídez', 2], ['Pilar', 1], ['Del Viso', 2],
    ['Belén de Escobar', 2], ['Garín', 2], ['Ingeniero Maschwitz', 2], ['San Martín', 1], ['Villa Ballester', 2],
    ['Caseros', 1], ['Ciudadela', 2], ['Santos Lugares', 2], ['Grand Bourg', 2], ['Los Polvorines', 2], ['José C. Paz', 2],
    ['San Miguel', 1], ['Bella Vista', 1], ['Muñiz', 2],
  ] },
  { id: 'gba-oeste', name: 'GBA Zona Oeste', query: 'Buenos Aires', zones: [
    ['Morón', 1], ['Castelar', 1], ['Haedo', 2], ['El Palomar', 2], ['Hurlingham', 2], ['Ituzaingó', 1], ['Merlo', 1],
    ['Padua', 2], ['Moreno', 1], ['San Justo', 1], ['Ramos Mejía', 1], ['Villa Luzuriaga', 2], ['Isidro Casanova', 2],
    ['Gregorio de Laferrere', 2], ['González Catán', 2], ['General Rodríguez', 2], ['Luján', 1],
  ] },
  { id: 'gba-sur', name: 'GBA Zona Sur', query: 'Buenos Aires', zones: [
    ['Avellaneda', 1], ['Wilde', 2], ['Sarandí', 2], ['Lanús', 1], ['Remedios de Escalada', 2], ['Lomas de Zamora', 1],
    ['Banfield', 1], ['Temperley', 1], ['Quilmes', 1], ['Bernal', 1], ['Berazategui', 1], ['Florencio Varela', 2],
    ['Adrogué', 1], ['Burzaco', 2], ['Longchamps', 2], ['Rafael Calzada', 2], ['Monte Grande', 1], ['Ezeiza', 2],
    ['Canning', 2], ['Cañuelas', 2], ['San Vicente', 3], ['La Plata', 1], ['City Bell', 2], ['Berisso', 2], ['Ensenada', 3],
  ] },
  { id: 'bsas', name: 'Buenos Aires (interior)', query: 'Buenos Aires', zones: [
    ['Mar del Plata', 1], ['Bahía Blanca', 1], ['Tandil', 2], ['Olavarría', 2], ['Azul', 2], ['Necochea', 2],
    ['Junín', 2], ['Pergamino', 2], ['San Nicolás de los Arroyos', 2], ['Zárate', 2], ['Campana', 2], ['Chivilcoy', 2],
    ['Mercedes', 2], ['Pinamar', 2], ['Villa Gesell', 2], ['Trenque Lauquen', 3], ['Nueve de Julio', 3], ['Bragado', 3],
    ['Tres Arroyos', 3], ['Chascomús', 3], ['San Pedro', 3], ['Balcarce', 3], ['Coronel Suárez', 3], ['Lobos', 3],
    ['Dolores', 3], ['Miramar', 3],
  ] },
  { id: 'cordoba', name: 'Córdoba', query: 'Córdoba', zones: [
    ['Córdoba Centro', 1], ['Nueva Córdoba', 1], ['Cerro de las Rosas', 1], ['General Paz, Córdoba', 1], ['Alta Córdoba', 1],
    ['Barrio Jardín, Córdoba', 2], ['Villa Belgrano, Córdoba', 2], ['Argüello, Córdoba', 2], ['Villa Allende', 2],
    ['Villa Carlos Paz', 1], ['Río Cuarto', 1], ['Villa María', 2], ['San Francisco', 2], ['Alta Gracia', 2],
    ['Jesús María', 2], ['Río Tercero', 2], ['Bell Ville', 3], ['Marcos Juárez', 3], ['La Falda', 3], ['Cosquín', 3],
    ['Villa General Belgrano', 3], ['Unquillo', 3],
  ] },
  { id: 'santa-fe', name: 'Santa Fe', query: 'Santa Fe', zones: [
    ['Rosario Centro', 1], ['Pichincha, Rosario', 1], ['Fisherton, Rosario', 1], ['Echesortu, Rosario', 2],
    ['Barrio Martin, Rosario', 2], ['Funes', 1], ['Santa Fe Capital', 1], ['Rafaela', 2], ['Venado Tuerto', 2],
    ['Reconquista', 2], ['Villa Gobernador Gálvez', 2], ['Granadero Baigorria', 2], ['Santo Tomé', 2], ['Esperanza', 3],
    ['Casilda', 3], ['San Lorenzo', 3], ['Cañada de Gómez', 3],
  ] },
  { id: 'mendoza', name: 'Mendoza', query: 'Mendoza', zones: [
    ['Mendoza Ciudad', 1], ['Godoy Cruz', 1], ['Guaymallén', 1], ['Las Heras', 2], ['Luján de Cuyo', 2], ['Maipú', 2],
    ['San Rafael', 2], ['Tunuyán', 3], ['San Martín', 3],
  ] },
  { id: 'tucuman', name: 'Tucumán', query: 'Tucumán', zones: [
    ['San Miguel de Tucumán', 1], ['Yerba Buena', 1], ['Tafí Viejo', 2], ['Banda del Río Salí', 3], ['Concepción', 3],
    ['Aguilares', 3],
  ] },
  { id: 'salta', name: 'Salta', query: 'Salta', zones: [
    ['Salta Capital', 1], ['San Ramón de la Nueva Orán', 2], ['Tartagal', 3], ['General Güemes', 3], ['Metán', 3],
    ['Cafayate', 3],
  ] },
  { id: 'jujuy', name: 'Jujuy', query: 'Jujuy', zones: [
    ['San Salvador de Jujuy', 1], ['Palpalá', 3], ['San Pedro de Jujuy', 3], ['Libertador General San Martín', 3],
  ] },
  { id: 'entre-rios', name: 'Entre Ríos', query: 'Entre Ríos', zones: [
    ['Paraná', 1], ['Concordia', 2], ['Gualeguaychú', 2], ['Concepción del Uruguay', 2], ['Villaguay', 3], ['Victoria', 3],
    ['Colón', 3], ['Chajarí', 3],
  ] },
  { id: 'corrientes', name: 'Corrientes', query: 'Corrientes', zones: [
    ['Corrientes Capital', 1], ['Goya', 2], ['Paso de los Libres', 3], ['Mercedes', 3], ['Curuzú Cuatiá', 3], ['Santo Tomé', 3],
  ] },
  { id: 'misiones', name: 'Misiones', query: 'Misiones', zones: [
    ['Posadas', 1], ['Oberá', 2], ['Eldorado', 2], ['Puerto Iguazú', 2], ['Garupá', 3], ['Apóstoles', 3],
  ] },
  { id: 'chaco', name: 'Chaco', query: 'Chaco', zones: [
    ['Resistencia', 1], ['Presidencia Roque Sáenz Peña', 2], ['Barranqueras', 3], ['Villa Ángela', 3], ['Charata', 3],
  ] },
  { id: 'formosa', name: 'Formosa', query: 'Formosa', zones: [['Formosa Capital', 2], ['Clorinda', 3]] },
  { id: 'santiago', name: 'Santiago del Estero', query: 'Santiago del Estero', zones: [
    ['Santiago del Estero Capital', 1], ['La Banda', 2], ['Termas de Río Hondo', 3], ['Añatuya', 3],
  ] },
  { id: 'catamarca', name: 'Catamarca', query: 'Catamarca', zones: [['San Fernando del Valle de Catamarca', 2], ['Valle Viejo', 3]] },
  { id: 'la-rioja', name: 'La Rioja', query: 'La Rioja', zones: [['La Rioja Capital', 2], ['Chilecito', 3]] },
  { id: 'san-juan', name: 'San Juan', query: 'San Juan', zones: [
    ['San Juan Capital', 1], ['Rivadavia', 2], ['Rawson', 2], ['Chimbas', 3], ['Santa Lucía', 3], ['Pocito', 3],
  ] },
  { id: 'san-luis', name: 'San Luis', query: 'San Luis', zones: [
    ['San Luis Capital', 2], ['Villa Mercedes', 2], ['Merlo', 3], ['Juana Koslay', 3],
  ] },
  { id: 'la-pampa', name: 'La Pampa', query: 'La Pampa', zones: [['Santa Rosa', 2], ['General Pico', 3], ['Toay', 3]] },
  { id: 'neuquen', name: 'Neuquén', query: 'Neuquén', zones: [
    ['Neuquén Capital', 1], ['Plottier', 2], ['Centenario', 3], ['Cutral Có', 3], ['Zapala', 3],
    ['San Martín de los Andes', 2], ['Villa La Angostura', 3],
  ] },
  { id: 'rio-negro', name: 'Río Negro', query: 'Río Negro', zones: [
    ['San Carlos de Bariloche', 1], ['General Roca', 2], ['Cipolletti', 2], ['Viedma', 2], ['Allen', 3], ['Villa Regina', 3],
    ['El Bolsón', 3],
  ] },
  { id: 'chubut', name: 'Chubut', query: 'Chubut', zones: [
    ['Comodoro Rivadavia', 1], ['Trelew', 2], ['Puerto Madryn', 2], ['Rawson', 3], ['Esquel', 3],
  ] },
  { id: 'santa-cruz', name: 'Santa Cruz', query: 'Santa Cruz', zones: [['Río Gallegos', 2], ['Caleta Olivia', 3], ['El Calafate', 3]] },
  { id: 'tierra-del-fuego', name: 'Tierra del Fuego', query: 'Tierra del Fuego', zones: [['Ushuaia', 2], ['Río Grande', 2]] },
];

function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const PROVINCES = PROVINCES_RAW.map(p => ({
  id: p.id,
  name: p.name,
  zones: p.zones.map(([name, tier]) => ({
    id: `${p.id}:${slug(name)}`,
    name,
    tier,
    provinceId: p.id,
    province: p.name,
    // Texto que va en la búsqueda de Maps: "restaurantes en Palermo, CABA, Argentina".
    query: `${name}, ${p.query}, Argentina`,
  })),
}));

export const ZONES = PROVINCES.flatMap(p => p.zones);

const RUBRO_BY_ID = new Map(RUBROS.map(r => [r.id, r]));
const ZONE_BY_ID = new Map(ZONES.map(z => [z.id, z]));

export function getRubro(id) { return RUBRO_BY_ID.get(id) ?? null; }
export function getZone(id) { return ZONE_BY_ID.get(id) ?? null; }
