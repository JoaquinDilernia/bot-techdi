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

const TIER_LABEL = { 1: 'Grande', 2: 'Mediana', 3: 'Chica' };

function norm(s) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

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
  const [catalog, setCatalog] = useState(null);
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
        setCatalog(data.catalog);
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

  if (loading || !config || !catalog) {
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
        {summary?.combos?.total > 0 && (
          <p className={styles.hint}>
            Búsquedas: {summary.combos.searched} de {summary.combos.total} combinaciones rubro × zona ya recorridas
            {summary.combos.exhausted > 0 && ` · ${summary.combos.exhausted} agotadas (se vuelven a probar en 3 meses)`}.
          </p>
        )}
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
            hasSearches={config.rubroIds.length > 0 && config.zoneIds.length > 0}
          />
        )}
        {tab === 'pipeline' && (
          <PipelineTab prospects={prospects} filter={filter} setFilter={setFilter} counts={counts} setStatus={setStatus} busy={busy} />
        )}
        {tab === 'config' && (
          <ConfigTab config={config} catalog={catalog} templates={templates} saveConfig={saveConfig} busy={busy} />
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
          <button className={styles.btnSecondary} onClick={searchNow} disabled={busy || !hasSearches} title={hasSearches ? '' : 'Primero elegí rubros y zonas en Configuración'}>
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
          No hay negocios para aprobar. {hasSearches ? 'La búsqueda corre sola a las 8, o tocá "Buscar ahora".' : 'Elegí rubros y zonas en Configuración para empezar.'}
        </p>
      ) : (
        <div className={styles.cards}>
          {pending.map(p => (
            <label key={p.id} className={`${styles.card} ${selected.has(p.id) ? styles.cardSelected : ''}`}>
              <div className={styles.cardHead}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} />
                <div className={styles.cardTitle}>
                  <strong>{p.shortName || p.name}</strong>
                  <span className={styles.muted}>{p.rubro} · {p.zona}, {p.provincia}</span>
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

// Resultados agrupados por un campo del prospecto (rubro, provincia): lo que
// sirve para decidir qué rubros y zonas conviene seguir buscando.
function resultsBy(prospects, key) {
  const rows = new Map();
  for (const p of prospects) {
    if (!p.sentAt && !RESPONDED.includes(p.status)) continue;
    const k = p[key] ?? '—';
    const r = rows.get(k) ?? { key: k, sent: 0, responded: 0, interested: 0, no: 0 };
    r.sent++;
    if (RESPONDED.includes(p.status)) r.responded++;
    if (['interesado', 'reunion', 'cliente'].includes(p.status)) r.interested++;
    if (p.status === 'no_interesa') r.no++;
    rows.set(k, r);
  }
  return [...rows.values()].sort((a, b) => b.sent - a.sent);
}

function ResultsTable({ title, rows }) {
  if (rows.length === 0) return null;
  return (
    <div className={styles.table}>
      <div className={`${styles.tableHead} ${styles.cols5}`}>
        <span>{title}</span><span>Enviados</span><span>Respondieron</span><span>Les interesa</span><span>No, gracias</span>
      </div>
      {rows.map(r => (
        <div key={r.key} className={`${styles.tableRow} ${styles.cols5}`}>
          <span><strong>{r.key}</strong></span>
          <span>{r.sent}</span>
          <span>{r.responded} <span className={styles.muted}>({Math.round((r.responded / r.sent) * 100)}%)</span></span>
          <span>{r.interested}</span>
          <span>{r.no}</span>
        </div>
      ))}
    </div>
  );
}

function PipelineTab({ prospects, filter, setFilter, counts, setStatus, busy }) {
  const visible = prospects.filter(p => p.status !== 'pendiente' && (filter === 'todos' || p.status === filter));

  return (
    <>
      <ResultsTable title="Rubro" rows={resultsBy(prospects, 'rubro')} />
      <ResultsTable title="Provincia" rows={resultsBy(prospects, 'provincia')} />

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
                {/* Solo los que recibieron la plantilla tienen conversación; al
                    resto se lo abre en Maps para poder mirarlo. */}
                {p.sentAt || RESPONDED.includes(p.status)
                  ? <a className={styles.nameLink} href={`#/conversations?open=${encodeURIComponent(p.contactId)}`}>{p.shortName || p.name}</a>
                  : <a className={styles.nameLink} href={p.mapsUrl ?? '#'} target="_blank" rel="noreferrer">{p.shortName || p.name}</a>}
                <span className={styles.muted}> · {p.rubro}, {p.zona} ({p.provincia})</span>
                {p.scoreReason && <span className={styles.rowReason}>IA {p.score}/5: {p.scoreReason}</span>}
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

function ConfigTab({ config, catalog, templates, saveConfig, busy }) {
  const [dailyCap, setDailyCap] = useState(config.dailyCap);
  const [autoApprove, setAutoApprove] = useState(config.autoApprove);
  const [templateNames, setTemplateNames] = useState(config.templates);
  const [rubroIds, setRubroIds] = useState(new Set(config.rubroIds));
  const [zoneIds, setZoneIds] = useState(new Set(config.zoneIds));
  const [openProvinces, setOpenProvinces] = useState(new Set());
  const [zoneQuery, setZoneQuery] = useState('');
  const [saved, setSaved] = useState(false);

  const allZoneIds = useMemo(() => catalog.provinces.flatMap(p => p.zones.map(z => z.id)), [catalog]);
  const dirty = () => setSaved(false);

  function toggleIn(setter, ids, on) {
    dirty();
    setter(prev => {
      const n = new Set(prev);
      ids.forEach(id => (on ? n.add(id) : n.delete(id)));
      return n;
    });
  }

  function toggleOpen(id) {
    setOpenProvinces(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function handleSave() {
    const ok = await saveConfig({
      dailyCap,
      autoApprove,
      templates: templateNames,
      rubroIds: [...rubroIds],
      zoneIds: [...zoneIds],
    });
    setSaved(ok);
  }

  const q = norm(zoneQuery.trim());
  const provinces = catalog.provinces
    .map(p => ({ ...p, visibleZones: q && !norm(p.name).includes(q) ? p.zones.filter(z => norm(z.name).includes(q)) : p.zones }))
    .filter(p => p.visibleZones.length > 0);

  return (
    <div className={styles.form}>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label}>Envíos por día (máximo)</label>
          <input className={styles.input} type="number" min={1} max={100} value={dailyCap} onChange={e => { setDailyCap(e.target.value); dirty(); }} />
          <p className={styles.hint}>Es un tope, no un objetivo: si un día hay menos aprobados, se mandan menos. Si la calidad del número baja a amarillo se reduce a la mitad, y en rojo se pausa todo.</p>
        </div>
        <label className={styles.checkLabel}>
          <input type="checkbox" checked={autoApprove} onChange={e => { setAutoApprove(e.target.checked); dirty(); }} />
          Aprobar automáticamente lo que la IA califica con 3/5 o más
        </label>
      </div>

      <h2 className={styles.formTitle}>Rubros</h2>
      <p className={styles.hint}>Cada grupo de rubros usa su propia plantilla. Elegí los rubros a los que les queremos escribir.</p>
      {Object.entries(catalog.groups).map(([groupId, group]) => {
        const rubros = catalog.rubros.filter(r => r.group === groupId);
        const selectedCount = rubros.filter(r => rubroIds.has(r.id)).length;
        const tpl = templates.find(t => t.name === templateNames[groupId]);
        return (
          <div key={groupId} className={styles.searchCard}>
            <div className={styles.groupHead}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={selectedCount === rubros.length}
                  ref={el => { if (el) el.indeterminate = selectedCount > 0 && selectedCount < rubros.length; }}
                  onChange={e => toggleIn(setRubroIds, rubros.map(r => r.id), e.target.checked)}
                />
                <strong>{group.label}</strong>
              </label>
              <span className={styles.muted}>{selectedCount}/{rubros.length}</span>
            </div>
            <div className={styles.chips}>
              {rubros.map(r => (
                <button
                  type="button"
                  key={r.id}
                  className={`${styles.chip} ${rubroIds.has(r.id) ? styles.chipActive : ''}`}
                  onClick={() => toggleIn(setRubroIds, [r.id], !rubroIds.has(r.id))}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Plantilla</label>
              <select
                className={styles.input}
                value={templateNames[groupId] ?? ''}
                onChange={e => { dirty(); setTemplateNames(prev => ({ ...prev, [groupId]: e.target.value })); }}
              >
                {!tpl && <option value={templateNames[groupId]}>{templateNames[groupId]} (no está en Plantillas)</option>}
                {templates.map(t => (
                  <option key={t.id} value={t.name}>{t.displayName} ({t.metaStatus ?? 'sin sincronizar'})</option>
                ))}
              </select>
              {tpl && <p className={styles.messagePreview}>{tpl.bodyText}{tpl.buttons?.length ? `\n\n[${tpl.buttons.join('] [')}]` : ''}</p>}
              {tpl && tpl.metaStatus !== 'APPROVED' && (
                <p className={styles.hint}>⚠ Todavía no está aprobada por Meta: se puede buscar y aprobar negocios, pero no se manda hasta que la aprueben.</p>
              )}
            </div>
          </div>
        );
      })}

      <h2 className={styles.formTitle}>Zonas</h2>
      <p className={styles.hint}>
        Las ciudades grandes están divididas en barrios o localidades (Google Maps trae hasta 60 resultados por búsqueda).
        Se buscan primero las zonas más grandes y se van rotando día a día.
      </p>
      <div className={styles.toolbar}>
        <input className={styles.input} type="search" placeholder="Buscar provincia, ciudad o barrio…" value={zoneQuery} onChange={e => setZoneQuery(e.target.value)} />
        <div className={styles.toolbarActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => toggleIn(setZoneIds, allZoneIds, true)}>Toda Argentina</button>
          <button type="button" className={styles.btnSecondary} onClick={() => toggleIn(setZoneIds, allZoneIds, false)}>Limpiar</button>
        </div>
      </div>
      <div className={styles.provinceList}>
        {provinces.map(p => {
          const ids = p.zones.map(z => z.id);
          const selectedCount = ids.filter(id => zoneIds.has(id)).length;
          const open = openProvinces.has(p.id) || !!q;
          return (
            <div key={p.id} className={styles.provinceRow}>
              <div className={styles.groupHead}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={selectedCount === ids.length}
                    ref={el => { if (el) el.indeterminate = selectedCount > 0 && selectedCount < ids.length; }}
                    onChange={e => toggleIn(setZoneIds, ids, e.target.checked)}
                  />
                  {p.name}
                </label>
                <button type="button" className={styles.expandBtn} onClick={() => toggleOpen(p.id)}>
                  {selectedCount}/{ids.length} {open ? '▴' : '▾'}
                </button>
              </div>
              {open && (
                <div className={styles.chips}>
                  {p.visibleZones.map(z => (
                    <button
                      type="button"
                      key={z.id}
                      title={TIER_LABEL[z.tier]}
                      className={`${styles.chip} ${zoneIds.has(z.id) ? styles.chipActive : ''}`}
                      onClick={() => toggleIn(setZoneIds, [z.id], !zoneIds.has(z.id))}
                    >
                      {z.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.formActions}>
        <span className={styles.muted}>
          {rubroIds.size} rubros × {zoneIds.size} zonas = {(rubroIds.size * zoneIds.size).toLocaleString('es-AR')} búsquedas posibles
        </span>
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
