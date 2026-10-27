import { useCallback, useEffect, useMemo, useState } from 'react';
import { authFetch, BASE_URL } from '../lib/api';
import styles from './Prospects.module.css';

const STATUS_LABEL = {
  pendiente: 'Para aprobar',
  aprobado: 'En cola',
  enviado: 'Enviado',
  error: 'Falló',
  respondio: 'Respondió',
  interesado: 'Le interesa',
  no_interesa: 'No le interesa',
  reunion: 'Reunión',
  cliente: 'Cliente',
  descartado: 'Descartado',
};
const STATUS_TONE = {
  pendiente: 'neutral', aprobado: 'info', enviado: 'info', error: 'danger',
  respondio: 'success', interesado: 'success', no_interesa: 'muted',
  reunion: 'success', cliente: 'success', descartado: 'muted',
};
// Estados que se pueden poner a mano desde el pipeline.
const MANUAL_STATUSES = ['respondio', 'interesado', 'reunion', 'cliente', 'no_interesa', 'descartado'];
const PIPELINE_FILTERS = ['todos', 'aprobado', 'enviado', 'respondio', 'interesado', 'reunion', 'cliente', 'no_interesa', 'error', 'descartado'];
const RESPONDED = ['respondio', 'interesado', 'no_interesa', 'reunion', 'cliente'];

const QUALITY_LABEL = { GREEN: 'Alta', YELLOW: 'Media', RED: 'Baja', UNKNOWN: 'Sin datos' };

const EMPTY_SEARCH = { rubro: '', zona: '', offer: '', templateName: '', language: 'es_AR', paramsTemplate: ['{{negocio}}'], active: true };

function formatDate(ts) {
  if (!ts) return '—';
  try {
    const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
    return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

export default function Prospects() {
  const [tab, setTab] = useState('aprobar');
  const [prospects, setProspects] = useState([]);
  const [config, setConfig] = useState(null);
  const [summary, setSummary] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('todos');

  const load = useCallback(async () => {
    try {
      const [pRes, tRes] = await Promise.all([
        authFetch(BASE_URL + '/api/prospects'),
        authFetch(BASE_URL + '/api/templates'),
      ]);
      if (pRes.ok) {
        const data = await pRes.json();
        setProspects(data.prospects ?? []);
        setConfig(data.config);
        setSummary(data.summary);
      }
      if (tRes.ok) setTemplates(await tRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => prospects.filter(p => p.status === 'pendiente'), [prospects]);
  const counts = useMemo(() => {
    const c = {};
    prospects.forEach(p => { c[p.status] = (c[p.status] ?? 0) + 1; });
    return c;
  }, [prospects]);
  const sentTotal = prospects.filter(p => p.sentAt || RESPONDED.includes(p.status)).length;
  const respondedTotal = prospects.filter(p => RESPONDED.includes(p.status)).length;

  async function saveConfig(patch) {
    setBusy(true); setError('');
    try {
      const r = await authFetch(BASE_URL + '/api/prospects/config', { method: 'PUT', body: patch });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setConfig(data.config);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(ids, status) {
    if (ids.length === 0) return;
    setBusy(true); setError('');
    try {
      const r = await authFetch(BASE_URL + '/api/prospects/status', { method: 'POST', body: { ids, status } });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function searchNow() {
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await authFetch(BASE_URL + '/api/prospects/search-now', { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      if (data.skipped) {
        setNotice(`No se buscó: ${data.reason}.`);
      } else {
        const added = data.summary.reduce((n, s) => n + (s.added ?? 0), 0);
        const errors = data.summary.filter(s => s.error);
        setNotice(`Listo: ${added} negocios nuevos para aprobar.${errors.length ? ` Error en ${errors.map(e => `"${e.search}": ${e.error}`).join('; ')}` : ''}`);
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    setBusy(true);
    try {
      const r = await authFetch(BASE_URL + '/api/prospects/resume', { method: 'POST' });
      if (r.ok) setConfig((await r.json()).config);
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  if (loading || !config) {
    return <div className={styles.page}><p className={styles.empty}>Cargando…</p></div>;
  }

  const stateLabel = config.paused ? 'Pausada' : config.enabled ? 'Activa' : 'Apagada';
  const stateTone = config.paused ? 'danger' : config.enabled ? 'success' : 'muted';

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Prospección</h1>
          <p className={styles.subtitle}>
            Todos los días a las 8 buscamos negocios en Google Maps, la IA los califica y, una vez
            aprobados, les mandamos la plantilla de a poco en horario comercial. Si responden, sigue TeDI.
          </p>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.badge} ${styles[`tone_${stateTone}`]}`}>{stateLabel}</span>
          <button
            className={config.enabled ? styles.btnSecondary : styles.btnPrimary}
            onClick={() => saveConfig({ enabled: !config.enabled })}
            disabled={busy}
          >
            {config.enabled ? 'Apagar envíos' : 'Activar envíos'}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {config.paused && (
          <div className={styles.pauseBanner}>
            <div>
              <strong>Prospección pausada automáticamente.</strong> {config.pausedReason}
              <span className={styles.muted}> · {formatDate(config.pausedAt)}</span>
            </div>
            <button className={styles.btnSecondary} onClick={resume} disabled={busy}>Reanudar</button>
          </div>
        )}

        <div className={styles.statsGrid}>
          <Stat label="Enviados hoy" value={`${summary?.sentToday ?? 0}/${summary?.effectiveCap ?? config.dailyCap}`} />
          <Stat
            label="Calidad del número"
            value={QUALITY_LABEL[summary?.quality] ?? summary?.quality}
            tone={summary?.quality === 'RED' ? 'danger' : summary?.quality === 'YELLOW' ? 'warn' : summary?.quality === 'GREEN' ? 'success' : null}
          />
          <Stat label="Para aprobar" value={counts.pendiente ?? 0} />
          <Stat label="En cola" value={counts.aprobado ?? 0} />
          <Stat label="Respondieron" value={`${respondedTotal}${sentTotal ? ` (${Math.round((respondedTotal / sentTotal) * 100)}%)` : ''}`} tone="success" />
          <Stat label="Les interesa" value={(counts.interesado ?? 0) + (counts.reunion ?? 0) + (counts.cliente ?? 0)} tone="success" />
        </div>
        {summary?.quality === 'YELLOW' && (
          <p className={styles.hint}>La calidad del número está en amarillo: el cupo diario bajó a la mitad hasta que vuelva a verde.</p>
        )}

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'aprobar' ? styles.tabActive : ''}`} onClick={() => setTab('aprobar')}>
            Para aprobar {pending.length > 0 && <span className={styles.tabCount}>{pending.length}</span>}
          </button>
          <button className={`${styles.tab} ${tab === 'pipeline' ? styles.tabActive : ''}`} onClick={() => setTab('pipeline')}>Pipeline</button>
          <button className={`${styles.tab} ${tab === 'config' ? styles.tabActive : ''}`} onClick={() => setTab('config')}>Configuración</button>
        </div>

        {notice && <p className={styles.notice}>{notice}</p>}
        {error && <p className={styles.error}>{error}</p>}

        {tab === 'aprobar' && (
          <ApproveTab
            pending={pending}
            selected={selected}
            toggleSelected={toggleSelected}
            setSelected={setSelected}
            setStatus={setStatus}
            searchNow={searchNow}
            busy={busy}
            hasSearches={config.searches.length > 0}
          />
        )}
        {tab === 'pipeline' && (
          <PipelineTab prospects={prospects} filter={filter} setFilter={setFilter} counts={counts} setStatus={setStatus} busy={busy} searches={config.searches} />
        )}
        {tab === 'config' && (
          <ConfigTab config={config} templates={templates} saveConfig={saveConfig} busy={busy} />
        )}
      </div>
    </div>
  );
}

function ApproveTab({ pending, selected, toggleSelected, setSelected, setStatus, searchNow, busy, hasSearches }) {
  const allSelected = pending.length > 0 && pending.every(p => selected.has(p.id));
  const ids = [...selected].filter(id => pending.some(p => p.id === id));
  return (
    <>
      <div className={styles.toolbar}>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(pending.map(p => p.id)))}
            disabled={pending.length === 0}
          />
          Seleccionar todos
        </label>
        <div className={styles.toolbarActions}>
          <button className={styles.btnSecondary} onClick={searchNow} disabled={busy || !hasSearches} title={hasSearches ? '' : 'Primero cargá una búsqueda en Configuración'}>
            {busy ? 'Trabajando…' : 'Buscar ahora'}
          </button>
          <button className={styles.btnSecondary} onClick={() => setStatus(ids, 'descartado')} disabled={busy || ids.length === 0}>
            Descartar ({ids.length})
          </button>
          <button className={styles.btnPrimary} onClick={() => setStatus(ids, 'aprobado')} disabled={busy || ids.length === 0}>
            Aprobar ({ids.length})
          </button>
        </div>
      </div>

      {pending.length === 0 ? (
        <p className={styles.empty}>
          No hay negocios para aprobar. {hasSearches ? 'La búsqueda corre sola a las 8, o tocá "Buscar ahora".' : 'Cargá una búsqueda en Configuración para empezar.'}
        </p>
      ) : (
        <div className={styles.cards}>
          {pending.map(p => (
            <label key={p.id} className={`${styles.card} ${selected.has(p.id) ? styles.cardSelected : ''}`}>
              <div className={styles.cardHead}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} />
                <div className={styles.cardTitle}>
                  <strong>{p.shortName || p.name}</strong>
                  <span className={styles.muted}>{p.rubro} · {p.zona}</span>
                </div>
                <span className={styles.score} title="Puntaje de la IA (1 a 5)">{p.score}/5</span>
              </div>
              <p className={styles.reason}>{p.scoreReason}</p>
              <div className={styles.cardMeta}>
                {p.address && <span>{p.address}</span>}
                {p.rating != null && <span>★ {p.rating} ({p.reviews} reseñas)</span>}
                <span>{p.phone}</span>
                {p.website && <a href={p.website} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>Web</a>}
                {p.mapsUrl && <a href={p.mapsUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>Maps</a>}
              </div>
              {p.renderedText
                ? <p className={styles.messagePreview}>{p.renderedText}</p>
                : <p className={styles.hint}>La plantilla "{p.templateName}" no está cargada en Plantillas, no se puede previsualizar.</p>}
            </label>
          ))}
        </div>
      )}
    </>
  );
}

function PipelineTab({ prospects, filter, setFilter, counts, setStatus, busy, searches }) {
  const visible = prospects.filter(p => p.status !== 'pendiente' && (filter === 'todos' || p.status === filter));

  // Resultado por búsqueda: lo que sirve para decidir qué rubro/zona/plantilla
  // conviene seguir usando.
  const bySearch = searches.map(s => {
    const mine = prospects.filter(p => p.searchId === s.id);
    const sent = mine.filter(p => p.sentAt || RESPONDED.includes(p.status)).length;
    const responded = mine.filter(p => RESPONDED.includes(p.status)).length;
    const interested = mine.filter(p => ['interesado', 'reunion', 'cliente'].includes(p.status)).length;
    const no = mine.filter(p => p.status === 'no_interesa').length;
    return { ...s, sent, responded, interested, no };
  }).filter(s => s.sent > 0);

  return (
    <>
      {bySearch.length > 0 && (
        <div className={styles.table}>
          <div className={`${styles.tableHead} ${styles.cols5}`}>
            <span>Búsqueda</span><span>Enviados</span><span>Respondieron</span><span>Les interesa</span><span>No, gracias</span>
          </div>
          {bySearch.map(s => (
            <div key={s.id} className={`${styles.tableRow} ${styles.cols5}`}>
              <span><strong>{s.rubro}</strong> <span className={styles.muted}>· {s.zona} · {s.templateName}</span></span>
              <span>{s.sent}</span>
              <span>{s.responded} <span className={styles.muted}>({Math.round((s.responded / s.sent) * 100)}%)</span></span>
              <span>{s.interested}</span>
              <span>{s.no}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.chips}>
        {PIPELINE_FILTERS.map(f => (
          <button key={f} className={`${styles.chip} ${filter === f ? styles.chipActive : ''}`} onClick={() => setFilter(f)}>
            {f === 'todos' ? 'Todos' : STATUS_LABEL[f]} {f !== 'todos' && counts[f] ? `(${counts[f]})` : ''}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className={styles.empty}>No hay negocios en este estado.</p>
      ) : (
        <div className={styles.table}>
          <div className={`${styles.tableHead} ${styles.cols6}`}>
            <span>Negocio</span><span>Estado</span><span>Mensaje</span><span>Enviado</span><span>Respuesta</span><span>Mover a</span>
          </div>
          {visible.map(p => (
            <div key={p.id} className={`${styles.tableRow} ${styles.cols6}`}>
              <span>
                <a className={styles.nameLink} href={`#/conversations?open=${encodeURIComponent(p.contactId)}`}>{p.shortName || p.name}</a>
                <span className={styles.muted}> · {p.rubro}, {p.zona}</span>
              </span>
              <span><span className={`${styles.badge} ${styles[`tone_${STATUS_TONE[p.status]}`]}`}>{STATUS_LABEL[p.status] ?? p.status}</span></span>
              <span className={styles.muted} title={p.error ?? ''}>
                {p.status === 'error' ? (p.error ?? 'Error') : p.readAt ? 'Leído' : p.deliveredAt ? 'Entregado' : p.sentAt ? 'Enviado' : '—'}
              </span>
              <span className={styles.muted}>{formatDate(p.sentAt)}</span>
              <span className={styles.muted}>{formatDate(p.respondedAt)}</span>
              <span>
                <select
                  className={styles.selectSmall}
                  value=""
                  disabled={busy}
                  onChange={e => e.target.value && setStatus([p.id], e.target.value)}
                >
                  <option value="">Mover…</option>
                  {(p.status === 'error' || p.status === 'descartado') && <option value="aprobado">Reintentar (a la cola)</option>}
                  {MANUAL_STATUSES.filter(s => s !== p.status).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ConfigTab({ config, templates, saveConfig, busy }) {
  const [dailyCap, setDailyCap] = useState(config.dailyCap);
  const [autoApprove, setAutoApprove] = useState(config.autoApprove);
  const [searches, setSearches] = useState(config.searches);
  const [saved, setSaved] = useState(false);

  function patchSearch(i, patch) {
    setSaved(false);
    setSearches(prev => prev.map((s, j) => j === i ? { ...s, ...patch } : s));
  }

  function pickTemplate(i, name) {
    const tpl = templates.find(t => t.name === name);
    const n = tpl?.params?.length ?? 0;
    // Por defecto la primera variable es el nombre del negocio.
    const paramsTemplate = Array.from({ length: n }, (_, k) => searches[i].paramsTemplate?.[k] ?? (k === 0 ? '{{negocio}}' : ''));
    patchSearch(i, { templateName: name, language: tpl?.language ?? 'es_AR', paramsTemplate });
  }

  async function handleSave() {
    const ok = await saveConfig({ dailyCap, autoApprove, searches });
    setSaved(ok);
  }

  return (
    <div className={styles.form}>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label}>Envíos por día (máximo)</label>
          <input className={styles.input} type="number" min={1} max={100} value={dailyCap} onChange={e => { setDailyCap(e.target.value); setSaved(false); }} />
          <p className={styles.hint}>Es un tope, no un objetivo: si un día hay menos aprobados, se mandan menos. Si la calidad del número baja a amarillo se reduce a la mitad, y en rojo se pausa todo.</p>
        </div>
        <label className={styles.checkLabel}>
          <input type="checkbox" checked={autoApprove} onChange={e => { setAutoApprove(e.target.checked); setSaved(false); }} />
          Aprobar automáticamente lo que la IA califica como bueno
        </label>
      </div>

      <h2 className={styles.formTitle}>Búsquedas</h2>
      <p className={styles.hint}>
        Cada búsqueda es un rubro + una zona de Google Maps. Se van rotando día a día. En los parámetros
        podés usar <code>{'{{negocio}}'}</code>, <code>{'{{rubro}}'}</code> y <code>{'{{zona}}'}</code>.
      </p>

      {searches.map((s, i) => {
        const tpl = templates.find(t => t.name === s.templateName);
        return (
          <div key={s.id ?? i} className={styles.searchCard}>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label}>Rubro</label>
                <input className={styles.input} value={s.rubro} onChange={e => patchSearch(i, { rubro: e.target.value })} placeholder="Ej: restaurantes" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Zona</label>
                <input className={styles.input} value={s.zona} onChange={e => patchSearch(i, { zona: e.target.value })} placeholder="Ej: San Isidro, Buenos Aires" />
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Qué le ofrecemos (para que la IA califique)</label>
              <input className={styles.input} value={s.offer} onChange={e => patchSearch(i, { offer: e.target.value })} placeholder="Ej: bot de WhatsApp que toma reservas y pedidos + sistema de reservas" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Plantilla</label>
              <select className={styles.input} value={s.templateName} onChange={e => pickTemplate(i, e.target.value)}>
                <option value="">Elegí una plantilla…</option>
                {templates.map(t => (
                  <option key={t.id} value={t.name}>{t.displayName} ({t.metaStatus ?? 'sin sincronizar'})</option>
                ))}
              </select>
              {tpl && <p className={styles.messagePreview}>{tpl.bodyText}{tpl.buttons?.length ? `\n\n[${tpl.buttons.join('] [')}]` : ''}</p>}
              {tpl && tpl.metaStatus !== 'APPROVED' && <p className={styles.hint}>⚠ Esta plantilla todavía no está aprobada por Meta: se puede buscar y aprobar, pero no se manda hasta que la aprueben.</p>}
            </div>
            {tpl?.params?.map((desc, k) => (
              <div key={k} className={styles.field}>
                <label className={styles.label}>{`{{${k + 1}}}`} {desc}</label>
                <input
                  className={styles.input}
                  value={s.paramsTemplate?.[k] ?? ''}
                  onChange={e => patchSearch(i, { paramsTemplate: Object.assign([...(s.paramsTemplate ?? [])], { [k]: e.target.value }) })}
                />
              </div>
            ))}
            <div className={styles.searchFooter}>
              <label className={styles.checkLabel}>
                <input type="checkbox" checked={s.active !== false} onChange={e => patchSearch(i, { active: e.target.checked })} />
                Activa
              </label>
              {s.lastRunAt && <span className={styles.muted}>Última vez: {formatDate(s.lastRunAt)} · {s.lastNewCount ?? 0} nuevos</span>}
              <button type="button" className={styles.linkDanger} onClick={() => { setSaved(false); setSearches(prev => prev.filter((_, j) => j !== i)); }}>
                Quitar
              </button>
            </div>
          </div>
        );
      })}

      <button type="button" className={styles.btnSecondary} onClick={() => { setSaved(false); setSearches(prev => [...prev, { ...EMPTY_SEARCH }]); }}>
        + Agregar búsqueda
      </button>

      <div className={styles.formActions}>
        {saved && <span className={styles.muted}>Guardado ✓</span>}
        <button className={styles.btnPrimary} onClick={handleSave} disabled={busy}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`${styles.statCard} ${tone ? styles[`stat_${tone}`] : ''}`}>
      <span className={styles.statValue}>{value ?? 0}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
