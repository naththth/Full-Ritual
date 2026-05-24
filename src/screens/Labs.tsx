import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { Icon3DLarge } from '../components/Icon3D';
import { PdfViewer } from '../components/PdfViewer';
import { formatDateLong, isoToday } from '../lib/dates';
import { fileToBase64 } from '../lib/files';
import { categorizeMarkers, fetchLabResults, saveLabResult, uploadLabFile } from '../lib/labService';
import { hasSupabase, supabase } from '../lib/supabase';
import { useApp } from '../store/useStore';
import type { LabFileType, LabMarker, LabMarkerStatus, LabResult } from '../types';

// ---------- Catálogo de marcadores conhecidos ----------

const KNOWN_MARKERS: Record<string, { label: string; unit: string; ref_min?: number; ref_max?: number; note?: string }> = {
  ferritina:        { label: 'Ferritina',          unit: 'ng/mL',  ref_min: 20,  ref_max: 200,  note: 'reserva de ferro' },
  vitamina_d:       { label: 'Vitamina D',          unit: 'ng/mL',  ref_min: 30,  ref_max: 100,  note: 'deficiência <20' },
  vitamina_b12:     { label: 'Vitamina B12',        unit: 'pg/mL',  ref_min: 200, ref_max: 900  },
  tsh:              { label: 'TSH',                 unit: 'mUI/L',  ref_min: 0.5, ref_max: 4.5  },
  t4_livre:         { label: 'T4 Livre',            unit: 'ng/dL',  ref_min: 0.8, ref_max: 1.8  },
  hemoglobina:      { label: 'Hemoglobina',         unit: 'g/dL',   ref_min: 12,  ref_max: 16   },
  hematocrito:      { label: 'Hematócrito',         unit: '%',      ref_min: 37,  ref_max: 47   },
  glicose:          { label: 'Glicose',             unit: 'mg/dL',  ref_min: 70,  ref_max: 99   },
  hba1c:            { label: 'HbA1c',               unit: '%',      ref_min: 0,   ref_max: 5.7,  note: 'hemoglobina glicada' },
  colesterol_total: { label: 'Colesterol Total',    unit: 'mg/dL',  ref_max: 200 },
  ldl:              { label: 'LDL',                 unit: 'mg/dL',  ref_max: 130, note: 'colesterol ruim' },
  hdl:              { label: 'HDL',                 unit: 'mg/dL',  ref_min: 50,  note: 'colesterol bom' },
  triglicerideos:   { label: 'Triglicerídeos',      unit: 'mg/dL',  ref_max: 150 },
  pcr:              { label: 'PCR',                 unit: 'mg/L',   ref_max: 5,   note: 'proteína C reativa' },
  vhs:              { label: 'VHS',                 unit: 'mm/h',   ref_max: 20,  note: 'velocidade de hemossedimentação' },
  zinco:            { label: 'Zinco',               unit: 'μg/dL',  ref_min: 70,  ref_max: 120 },
  magnesio:         { label: 'Magnésio',            unit: 'mg/dL',  ref_min: 1.7, ref_max: 2.2 },
  cortisol:         { label: 'Cortisol',            unit: 'μg/dL',  ref_min: 6,   ref_max: 23,   note: 'matinal' },
  insulina:         { label: 'Insulina',            unit: 'μUI/mL', ref_max: 15  },
  estradiol:        { label: 'Estradiol',           unit: 'pg/mL',  note: 'varia por fase do ciclo' },
  progesterona:     { label: 'Progesterona',        unit: 'ng/mL',  note: 'varia por fase do ciclo' },
  testosterona:     { label: 'Testosterona',        unit: 'ng/dL',  ref_min: 15,  ref_max: 70   },
  prolactina:       { label: 'Prolactina',          unit: 'ng/mL',  ref_min: 2,   ref_max: 29   },
};

const STATUS_COLOR: Record<LabMarkerStatus, string> = {
  normal:           'var(--diet)',
  low:              'var(--mind)',
  high:             'var(--body)',
  critical:         '#c0392b',
  nao_classificado: 'var(--ink-faint)',
};

const STATUS_LABEL: Record<LabMarkerStatus, string> = {
  normal:           'normal',
  low:              'baixo',
  high:             'alto',
  critical:         'crítico',
  nao_classificado: 'sem referência',
};

// ---------- Tela principal ----------

export function Labs() {
  const userId = useApp((s) => s.userId);
  const showToast = useApp((s) => s.showToast);
  const [results, setResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [draft, setDraft] = useState<Record<string, LabMarker> | null>(null);
  const [draftDate, setDraftDate] = useState(isoToday());
  const [draftLab, setDraftLab] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftFileUrl, setDraftFileUrl] = useState<string | null>(null);
  const [draftFileType, setDraftFileType] = useState<LabFileType>('photo');
  const [saving, setSaving] = useState(false);
  const [selectedResult, setSelectedResult] = useState<LabResult | null>(null);
  const [showAddMarker, setShowAddMarker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasSupabase || !userId) { setLoading(false); return; }
    fetchLabResults(userId)
      .then((data) => setResults(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleFile = async (file: File) => {
    if (!userId) {
      showToast('faça login para enviar laudos.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showToast('arquivo muito grande. máximo 20 MB.');
      return;
    }

    const isPdf = file.type === 'application/pdf';

    if (isPdf) {
      await handlePdf(file);
    } else {
      await handlePhoto(file);
    }
  };

  const handlePdf = async (file: File) => {
    setAnalyzing(true);
    try {
      const url = await uploadLabFile(userId!, file);
      setDraftFileUrl(url);
      setDraftFileType('pdf');
      setDraft({});
      setShowAddMarker(true);
    } catch (err) {
      console.error(err);
      showToast('não foi possível enviar o PDF.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePhoto = async (file: File) => {
    if (!hasSupabase || !userId) {
      showToast('faça login para analisar laudos.');
      return;
    }
    setAnalyzing(true);
    try {
      const photoUrl = await uploadLabFile(userId, file).catch(() => null);
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('analyze-lab-photo', {
        body: {
          image_base64: base64,
          mime_type: file.type,
          date: draftDate,
          lab_name: draftLab || undefined,
          photo_url: photoUrl,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDraft(data.markers ?? {});
      if (data.lab_name) setDraftLab(data.lab_name);
      if (data.date) setDraftDate(data.date);
      if (photoUrl) setDraftFileUrl(photoUrl);
      setDraftFileType('photo');
      if (data.lab_result) setResults((prev) => [data.lab_result as LabResult, ...prev]);
    } catch (err) {
      console.error(err);
      showToast('não foi possível analisar o laudo.');
    } finally {
      setAnalyzing(false);
    }
  };

  const saveDraft = async () => {
    if (draft === null || !userId || !hasSupabase) return;
    setSaving(true);
    try {
      const saved = await saveLabResult({
        user_id: userId,
        date: draftDate,
        lab_name: draftLab || null,
        photo_url: draftFileUrl,
        file_type: draftFileType,
        markers: draft,
        notes: draftNotes || null,
      });
      setResults((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]);
      setDraft(null);
      setDraftFileUrl(null);
      setDraftNotes('');
      setShowAddMarker(false);
      showToast('exame salvo.');
    } catch (err) {
      console.error(err);
      showToast('não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const abnormalCount = (r: LabResult) =>
    Object.values(r.markers).filter((m) => m.status !== 'normal' && m.status !== 'nao_classificado').length;

  if (selectedResult) {
    return <LabDetail result={selectedResult} onBack={() => setSelectedResult(null)} />;
  }

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">saúde · exames</span>
        <h1 className="t-display-lg">
          O que seu <em className="t-display-italic">sangue conta.</em>
        </h1>
        <p className="t-body muted">
          Foto ou PDF do laudo. IA extrai marcadores automaticamente, ou adicione manualmente.
        </p>
      </header>

      {/* Upload card */}
      <section className="card stack labs-upload-card">
        <span className="eyebrow">novo exame</span>
        <div className="labs-upload-grid">
          <label className="compact-field">
            <span>data do laudo</span>
            <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
          </label>
          <label className="compact-field">
            <span>laboratório</span>
            <input
              type="text"
              placeholder="ex: Fleury, Dasa..."
              value={draftLab}
              onChange={(e) => setDraftLab(e.target.value)}
            />
          </label>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
        />
        <div className="labs-upload-actions">
          <button
            className="btn btn--primary btn--full labs-photo-btn"
            onClick={() => fileRef.current?.click()}
            disabled={analyzing}
            aria-busy={analyzing}
          >
            {analyzing ? (
              <span className="labs-analyzing">
                <span className="labs-spinner" />
                {draftFileType === 'pdf' ? 'enviando PDF...' : 'analisando laudo...'}
              </span>
            ) : '+ foto ou PDF do laudo'}
          </button>
          <button
            className="btn btn--secondary btn--sm"
            onClick={() => { setDraft({}); setDraftFileType('manual'); setShowAddMarker(true); }}
            disabled={analyzing}
          >
            + entrada manual
          </button>
        </div>
      </section>

      {/* Draft: PDF preview + marcadores + entrada manual */}
      {draft !== null && (
        <section className="card stack">
          <div className="row-between">
            <span className="eyebrow">
              {draftFileType === 'pdf' ? 'PDF enviado · adicione os marcadores' :
               draftFileType === 'manual' ? 'entrada manual · adicione marcadores' :
               'marcadores extraídos pela IA'}
            </span>
            {Object.keys(draft).length > 0 && (
              <span className="chip">{Object.keys(draft).length} marcadores</span>
            )}
          </div>

          {/* PDF inline viewer */}
          {draftFileType === 'pdf' && draftFileUrl && (
            <PdfViewer url={draftFileUrl} title="Laudo enviado" />
          )}

          {/* Marcadores já adicionados */}
          {Object.keys(draft).length > 0 && (
            <div className="labs-markers-grid">
              {Object.entries(draft).map(([key, marker]) => (
                <MarkerCard
                  key={key}
                  markerKey={key}
                  marker={marker}
                  onRemove={() => setDraft((prev) => {
                    if (!prev) return prev;
                    const next = { ...prev };
                    delete next[key];
                    return next;
                  })}
                />
              ))}
            </div>
          )}

          {/* Formulário de adição de marcador */}
          {showAddMarker ? (
            <AddMarkerForm
              onAdd={(key, marker) => {
                setDraft((prev) => ({ ...(prev ?? {}), [key]: marker }));
                setShowAddMarker(false);
              }}
              onCancel={() => setShowAddMarker(false)}
            />
          ) : (
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => setShowAddMarker(true)}
            >
              + adicionar marcador
            </button>
          )}

          <textarea
            className="field"
            rows={2}
            placeholder="anotações (médico, contexto, sintomas)..."
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
          />
          <button
            className="btn btn--primary btn--full"
            onClick={() => void saveDraft()}
            disabled={saving}
          >
            {saving ? 'salvando...' : 'confirmar e salvar exame'}
          </button>
          <button className="btn btn--secondary btn--sm" onClick={() => {
            setDraft(null);
            setDraftFileUrl(null);
            setShowAddMarker(false);
          }}>
            descartar
          </button>
        </section>
      )}

      {/* Estado vazio */}
      {!loading && results.length === 0 && draft === null && (
        <div className="labs-empty">
          <Icon3DLarge kind="labs" size={64} className="labs-empty-glyph" />
          <p>Nenhum exame ainda. Envie a foto ou PDF de um laudo para começar.</p>
        </div>
      )}

      {/* Histórico */}
      {results.length > 0 && (
        <section className="stack">
          <span className="eyebrow">histórico de exames</span>
          {results.map((result) => {
            const abn = abnormalCount(result);
            return (
              <button
                key={result.id}
                className="card labs-result-row"
                onClick={() => setSelectedResult(result)}
              >
                <div className="labs-result-info">
                  <strong>{formatDateLong(result.date)}</strong>
                  <span className="t-body-sm muted">
                    {result.lab_name ?? 'laboratório'} · {Object.keys(result.markers).length} marcadores
                    {result.file_type === 'pdf' && ' · PDF'}
                  </span>
                </div>
                {abn > 0 ? (
                  <span className="labs-badge labs-badge--alert">{abn} fora</span>
                ) : (
                  <span className="labs-badge labs-badge--ok">tudo ok</span>
                )}
              </button>
            );
          })}
        </section>
      )}

      {results.length >= 2 && <LabTrends results={results} />}
    </div>
  );
}

// ---------- Detalhe do exame ----------

function LabDetail({ result, onBack }: { result: LabResult; onBack: () => void }) {
  const { normal, concerning } = categorizeMarkers(result.markers);
  const hasBoth = Object.keys(concerning).length > 0 && Object.keys(normal).length > 0;

  return (
    <div className="screen stack-md">
      <header className="screen-header stack">
        <button className="back-button" onClick={onBack} aria-label="Voltar">←</button>
        <span className="eyebrow">{result.lab_name ?? 'exame'} · {formatDateLong(result.date)}</span>
        <h1 className="t-display-lg">
          Detalhes do <em className="t-display-italic">laudo.</em>
        </h1>
      </header>

      {/* PDF ou foto do laudo */}
      {result.photo_url && (
        <section className="card stack">
          <span className="eyebrow">laudo original</span>
          {result.file_type === 'pdf' ? (
            <PdfViewer url={result.photo_url} title={result.lab_name ?? 'Laudo'} />
          ) : (
            <img src={result.photo_url} alt="Laudo original" style={{ borderRadius: 12, width: '100%' }} />
          )}
        </section>
      )}

      {/* Marcadores fora da referência */}
      {Object.keys(concerning).length > 0 && (
        <section className="card stack">
          <div className="labs-markers-section-header labs-markers-section-header--alert">
            <span className="eyebrow">fora da faixa de referência informada no exame</span>
            <span className="chip chip--alert">{Object.keys(concerning).length}</span>
          </div>
          <p className="t-body-sm muted labs-disclaimer">
            Os valores abaixo estão fora da faixa indicada no laudo. Esses dados são de referência informativa — consulte seu médico para interpretação clínica.
          </p>
          <div className="labs-markers-grid">
            {Object.entries(concerning).map(([key, marker]) => (
              <MarkerCard key={key} markerKey={key} marker={marker} showRef />
            ))}
          </div>
        </section>
      )}

      {/* Marcadores dentro da referência */}
      {Object.keys(normal).length > 0 && (
        <section className="card stack">
          {hasBoth && (
            <div className="labs-markers-section-header labs-markers-section-header--ok">
              <span className="eyebrow">dentro da faixa de referência</span>
              <span className="chip chip--ok">{Object.keys(normal).length}</span>
            </div>
          )}
          {!hasBoth && <span className="eyebrow">marcadores</span>}
          <div className="labs-markers-grid">
            {Object.entries(normal).map(([key, marker]) => (
              <MarkerCard key={key} markerKey={key} marker={marker} showRef />
            ))}
          </div>
        </section>
      )}

      {Object.keys(result.markers).length === 0 && (
        <div className="labs-empty">
          <p className="muted">Nenhum marcador registrado neste exame.</p>
        </div>
      )}

      {result.notes && (
        <section className="card stack">
          <span className="eyebrow">anotações</span>
          <p className="t-body">{result.notes}</p>
        </section>
      )}
    </div>
  );
}

// ---------- Card de marcador ----------

function MarkerCard({
  markerKey,
  marker,
  showRef = false,
  onRemove,
}: {
  markerKey: string;
  marker: LabMarker;
  showRef?: boolean;
  onRemove?: () => void;
}) {
  const known = KNOWN_MARKERS[markerKey];
  const label = known?.label ?? markerKey.replace(/_/g, ' ');
  const color = STATUS_COLOR[marker.status];
  const refMin = marker.ref_min ?? known?.ref_min;
  const refMax = marker.ref_max ?? known?.ref_max;

  return (
    <div
      className={`labs-marker-card labs-marker-card--${marker.status}`}
      style={{ '--marker-color': color } as CSSProperties}
    >
      {onRemove && (
        <button className="labs-marker-remove" onClick={onRemove} aria-label={`Remover ${label}`}>
          ×
        </button>
      )}
      <span className="labs-marker-label">{label}</span>
      <div className="labs-marker-value">
        <strong>{marker.value}</strong>
        <span>{marker.unit}</span>
      </div>
      <span className="labs-marker-status">{STATUS_LABEL[marker.status]}</span>
      {showRef && (refMin != null || refMax != null) && (
        <span className="labs-marker-ref">
          ref: {refMin != null ? refMin : '?'} – {refMax != null ? refMax : '?'} {marker.unit}
        </span>
      )}
      {marker.observacao && <span className="labs-marker-note">{marker.observacao}</span>}
      {!marker.observacao && known?.note && <span className="labs-marker-note">{known.note}</span>}
    </div>
  );
}

// ---------- Formulário de adição manual de marcador ----------

const EMPTY_FORM = {
  key: '',
  value: '',
  unit: '',
  ref_min: '',
  ref_max: '',
  status: 'normal' as LabMarkerStatus,
  observacao: '',
};

function AddMarkerForm({
  onAdd,
  onCancel,
}: {
  onAdd: (key: string, marker: LabMarker) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  const field = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const submit = () => {
    const key = form.key.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key) { setError('Nome do marcador obrigatório.'); return; }
    const value = parseFloat(form.value);
    if (isNaN(value)) { setError('Valor deve ser numérico.'); return; }
    if (!form.unit.trim()) { setError('Unidade obrigatória.'); return; }

    const marker: LabMarker = {
      value,
      unit: form.unit.trim(),
      ref_min: form.ref_min ? parseFloat(form.ref_min) : null,
      ref_max: form.ref_max ? parseFloat(form.ref_max) : null,
      status: form.status,
      observacao: form.observacao.trim() || null,
    };
    onAdd(key, marker);
    setForm(EMPTY_FORM);
    setError('');
  };

  return (
    <div className="labs-add-marker-form card--inset stack">
      <span className="eyebrow">novo marcador</span>
      {error && <p className="labs-form-error">{error}</p>}
      <div className="labs-upload-grid">
        <label className="compact-field">
          <span>nome do marcador *</span>
          <input
            type="text"
            placeholder="ex: ferritina, TSH..."
            value={form.key}
            onChange={field('key')}
          />
        </label>
        <label className="compact-field">
          <span>unidade *</span>
          <input
            type="text"
            placeholder="ex: ng/mL, %..."
            value={form.unit}
            onChange={field('unit')}
          />
        </label>
        <label className="compact-field">
          <span>valor *</span>
          <input
            type="number"
            step="any"
            placeholder="ex: 45.2"
            value={form.value}
            onChange={field('value')}
          />
        </label>
        <label className="compact-field">
          <span>status</span>
          <select value={form.status} onChange={field('status')}>
            <option value="normal">normal</option>
            <option value="low">baixo</option>
            <option value="high">alto</option>
            <option value="critical">crítico</option>
            <option value="nao_classificado">sem referência</option>
          </select>
        </label>
        <label className="compact-field">
          <span>ref. mínima</span>
          <input type="number" step="any" placeholder="opcional" value={form.ref_min} onChange={field('ref_min')} />
        </label>
        <label className="compact-field">
          <span>ref. máxima</span>
          <input type="number" step="any" placeholder="opcional" value={form.ref_max} onChange={field('ref_max')} />
        </label>
      </div>
      <label className="compact-field">
        <span>observação</span>
        <input
          type="text"
          placeholder="ex: colhido em jejum, matinal..."
          value={form.observacao}
          onChange={field('observacao')}
        />
      </label>
      <div className="row row--gap-sm">
        <button className="btn btn--primary btn--sm" onClick={submit}>adicionar</button>
        <button className="btn btn--secondary btn--sm" onClick={onCancel}>cancelar</button>
      </div>
    </div>
  );
}

// ---------- Tendências ----------

function LabTrends({ results }: { results: LabResult[] }) {
  const sorted = [...results].sort((a, b) => a.date.localeCompare(b.date));
  const allKeys = new Set<string>();
  sorted.forEach((r) => Object.keys(r.markers).forEach((k) => allKeys.add(k)));

  const trackedKeys = [...allKeys].filter((key) => {
    const vals = sorted.filter((r) => r.markers[key]);
    return vals.length >= 2;
  });

  if (!trackedKeys.length) return null;

  return (
    <section className="stack">
      <span className="eyebrow">tendências · marcadores</span>
      {trackedKeys.slice(0, 8).map((key) => {
        const known = KNOWN_MARKERS[key];
        const label = known?.label ?? key.replace(/_/g, ' ');
        const points = sorted
          .filter((r) => r.markers[key])
          .map((r) => ({ date: r.date, marker: r.markers[key] }));
        const latest = points[points.length - 1]?.marker;
        const prev = points[points.length - 2]?.marker;
        const delta = latest && prev ? latest.value - prev.value : null;

        return (
          <article key={key} className="card labs-trend-card" style={{ '--marker-color': STATUS_COLOR[latest?.status ?? 'normal'] } as CSSProperties}>
            <div className="row-between">
              <span>
                <strong>{label}</strong>
                {latest && <span className="t-body-sm muted"> · {latest.value} {latest.unit}</span>}
              </span>
              {delta != null && (
                <span className={`labs-trend-delta ${delta > 0 ? 'labs-trend-delta--up' : 'labs-trend-delta--down'}`}>
                  {delta > 0 ? '↑' : '↓'} {Math.abs(Math.round(delta * 100) / 100)}
                </span>
              )}
            </div>
            <div className="labs-trend-dots">
              {points.map((p, i) => (
                <div key={i} className="labs-trend-point">
                  <div
                    className="labs-trend-dot"
                    style={{ '--dot-color': STATUS_COLOR[p.marker.status] } as CSSProperties}
                    title={`${p.date}: ${p.marker.value} ${p.marker.unit}`}
                  />
                  <span>{new Date(`${p.date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' })}</span>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}
