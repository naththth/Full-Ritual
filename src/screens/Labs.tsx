import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { isoToday } from '../lib/dates';
import { uploadImageOrPreview } from '../lib/uploads';
import { hasSupabase, supabase } from '../lib/supabase';
import { useApp } from '../store/useStore';
import type { LabMarker, LabMarkerStatus, LabResult } from '../types';

// Marcadores conhecidos com referências femininas
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
  normal:   'var(--diet)',
  low:      'var(--mind)',
  high:     'var(--body)',
  critical: '#c0392b',
};

const STATUS_LABEL: Record<LabMarkerStatus, string> = {
  normal:   'normal',
  low:      'baixo',
  high:     'alto',
  critical: 'crítico',
};

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
  const [draftPhotoUrl, setDraftPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedResult, setSelectedResult] = useState<LabResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasSupabase || !userId) { setLoading(false); return; }
    supabase
      .from('lab_results')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) console.error(error);
        setResults((data ?? []) as LabResult[]);
        setLoading(false);
      });
  }, [userId]);

  const handlePhoto = async (file: File) => {
    if (!hasSupabase || !userId) {
      showToast('faça login para analisar laudos.');
      return;
    }
    setAnalyzing(true);
    try {
      const photoUrl = await uploadImageOrPreview({
        bucket: 'labs',
        userId,
        file,
        prefix: `lab-${isoToday()}`,
      }).catch(() => null);

      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('analyze-lab-photo', {
        body: {
          image_base64: base64.split(',')[1],
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
      if (photoUrl) setDraftPhotoUrl(photoUrl);
      if (data.lab_result) setResults((prev) => [data.lab_result as LabResult, ...prev]);
    } catch (err) {
      console.error(err);
      showToast('não foi possível analisar o laudo.');
    } finally {
      setAnalyzing(false);
    }
  };

  const saveDraft = async () => {
    if (!draft || !userId || !hasSupabase) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('lab_results')
        .insert({
          user_id: userId,
          date: draftDate,
          lab_name: draftLab || null,
          photo_url: draftPhotoUrl,
          markers: draft,
          notes: draftNotes || null,
        })
        .select('*')
        .single();
      if (error) throw error;
      setResults((prev) => [data as LabResult, ...prev.filter((r) => r.id !== data.id)]);
      setDraft(null);
      setDraftNotes('');
      showToast('exame salvo.');
    } catch (err) {
      console.error(err);
      showToast('não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const abnormalCount = (r: LabResult) =>
    Object.values(r.markers).filter((m) => m.status !== 'normal').length;

  if (selectedResult) {
    return <LabDetail result={selectedResult} onBack={() => setSelectedResult(null)} />;
  }

  return (
    <div className="screen stack-md">
      <header className="screen-header stack">
        <BackButton />
        <span className="eyebrow">saúde · exames</span>
        <h1 className="t-display-lg">
          O que seu <em className="t-display-italic">sangue conta.</em>
        </h1>
        <p className="t-body muted">
          Foto do laudo e a IA extrai os marcadores automaticamente. Histórico com tendências.
        </p>
      </header>

      {/* Upload card */}
      <section className="card stack labs-upload-card">
        <span className="eyebrow">novo exame · IA extrai</span>
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
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePhoto(f); }}
        />
        <button
          className="btn btn--primary btn--full labs-photo-btn"
          onClick={() => fileRef.current?.click()}
          disabled={analyzing}
          aria-busy={analyzing}
        >
          {analyzing ? (
            <span className="labs-analyzing">
              <span className="labs-spinner" />
              analisando laudo...
            </span>
          ) : '◐ enviar foto do laudo'}
        </button>
      </section>

      {/* Draft review */}
      {draft && Object.keys(draft).length > 0 && (
        <section className="card stack">
          <div className="row-between">
            <span className="eyebrow">marcadores extraídos</span>
            <span className="chip">{Object.keys(draft).length} encontrados</span>
          </div>
          <div className="labs-markers-grid">
            {Object.entries(draft).map(([key, marker]) => (
              <MarkerCard key={key} markerKey={key} marker={marker} />
            ))}
          </div>
          <textarea
            className="field"
            rows={2}
            placeholder="anotações (médico, contexto, sintomas)..."
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
          />
          <button className="btn btn--primary btn--full" onClick={() => void saveDraft()} disabled={saving}>
            {saving ? 'salvando...' : 'confirmar e salvar exame'}
          </button>
          <button className="btn btn--secondary btn--sm" onClick={() => setDraft(null)}>
            descartar
          </button>
        </section>
      )}

      {/* History */}
      {!loading && results.length === 0 && !draft && (
        <div className="labs-empty">
          <span className="labs-empty-glyph">◐</span>
          <p>Nenhum exame ainda. Envie a foto de um laudo para começar.</p>
        </div>
      )}

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
                  <strong>{formatDate(result.date)}</strong>
                  <span className="t-body-sm muted">{result.lab_name ?? 'laboratório'} · {Object.keys(result.markers).length} marcadores</span>
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

      {/* Trends */}
      {results.length >= 2 && <LabTrends results={results} />}
    </div>
  );
}

function LabDetail({ result, onBack }: { result: LabResult; onBack: () => void }) {
  return (
    <div className="screen stack-md">
      <header className="screen-header stack">
        <button className="back-button" onClick={onBack} aria-label="Voltar">←</button>
        <span className="eyebrow">{result.lab_name ?? 'exame'} · {formatDate(result.date)}</span>
        <h1 className="t-display-lg">
          Detalhes do <em className="t-display-italic">laudo.</em>
        </h1>
      </header>

      <section className="card stack">
        <span className="eyebrow">marcadores</span>
        <div className="labs-markers-grid">
          {Object.entries(result.markers).map(([key, marker]) => (
            <MarkerCard key={key} markerKey={key} marker={marker} showRef />
          ))}
        </div>
      </section>

      {result.notes && (
        <section className="card stack">
          <span className="eyebrow">anotações</span>
          <p className="t-body">{result.notes}</p>
        </section>
      )}

      {result.photo_url && (
        <section className="card stack">
          <span className="eyebrow">laudo original</span>
          <img src={result.photo_url} alt="Laudo original" style={{ borderRadius: 12, width: '100%' }} />
        </section>
      )}
    </div>
  );
}

function MarkerCard({ markerKey, marker, showRef = false }: { markerKey: string; marker: LabMarker; showRef?: boolean }) {
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
      {known?.note && <span className="labs-marker-note">{known.note}</span>}
    </div>
  );
}

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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}
