import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store/useStore';
import { supabase, hasSupabase } from '../lib/supabase';
import {
  listBodyMetrics, saveBodyMetric, deleteBodyMetric, analyzeBodyPhoto, analyzeBodyProgress,
  saveTargetSnapshot, bmi, normalizeHeightCm, waistHipRatio, navyBodyFatEstimate, observedPace, requiredPace, daysSince,
} from '../lib/bodyMetrics';
import type { BodyMetric } from '../types';

type ChartKey = 'weight_kg' | 'body_fat_pct' | 'waist_cm' | 'hip_cm' | 'bmi';

const CHART_OPTIONS: { key: ChartKey; label: string }[] = [
  { key: 'weight_kg', label: 'peso' },
  { key: 'body_fat_pct', label: '%gord' },
  { key: 'waist_cm', label: 'cintura' },
  { key: 'hip_cm', label: 'quadril' },
  { key: 'bmi', label: 'imc' },
];

export function BodyMetricsSection() {
  const userId = useApp((s) => s.userId);
  const profile = useApp((s) => s.profile);
  const setProfile = useApp((s) => s.setProfile);
  const showToast = useApp((s) => s.showToast);

  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [latestAnalysisId, setLatestAnalysisId] = useState<string | null>(null);
  const [chartKey, setChartKey] = useState<ChartKey>('weight_kg');
  const [compare, setCompare] = useState<{ a?: string; b?: string }>({});

  // form
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [fat, setFat] = useState('');
  const [waist, setWaist] = useState('');
  const [hip, setHip] = useState('');
  const [chest, setChest] = useState('');
  const [arm, setArm] = useState('');
  const [thigh, setThigh] = useState('');
  const [neck, setNeck] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const objectiveRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);

  // target
  const [tWeight, setTWeight] = useState(profile?.target_weight_kg != null ? String(profile.target_weight_kg) : '');
  const [tWeightMax, setTWeightMax] = useState(profile?.target_weight_kg_max != null ? String(profile.target_weight_kg_max) : '');
  const [tFat, setTFat] = useState(profile?.target_body_fat_pct != null ? String(profile.target_body_fat_pct) : '');
  const [tDate, setTDate] = useState(profile?.target_date ?? '');
  const [savingTarget, setSavingTarget] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    listBodyMetrics(userId).then((m) => {
      setMetrics(m);
      const lastHeight = m.find((x) => x.height_cm)?.height_cm;
      if (lastHeight && !height) setHeight(String(normalizeHeightCm(lastHeight)));
      setLoading(false);
    });
  }, [userId]);

  useEffect(() => {
    if (!profile) return;
    if (profile.target_weight_kg != null && !tWeight) setTWeight(String(profile.target_weight_kg));
    if (profile.target_weight_kg_max != null && !tWeightMax) setTWeightMax(String(profile.target_weight_kg_max));
    if (profile.target_body_fat_pct != null && !tFat) setTFat(String(profile.target_body_fat_pct));
    if (profile.target_date && !tDate) setTDate(profile.target_date);
  }, [profile]);

  const latest = metrics[0];
  const sinceLast = daysSince(latest?.date);

  const latestBmi = bmi(latest?.weight_kg ?? null, latest?.height_cm ?? null);
  const latestWhr = waistHipRatio(latest?.waist_cm ?? null, latest?.hip_cm ?? null);
  const navyEst = navyBodyFatEstimate({
    sex: 'f',
    waist_cm: latest?.waist_cm ?? null,
    neck_cm: latest?.neck_cm ?? null,
    height_cm: latest?.height_cm ?? null,
    hip_cm: latest?.hip_cm ?? null,
  });

  const pace = observedPace(metrics, 30);
  const target = profile?.target_weight_kg ?? null;
  const targetMax = profile?.target_weight_kg_max ?? null;
  const latestWeight = latest?.weight_kg != null ? Number(latest.weight_kg) : null;
  const targetDiff = latest?.weight_kg != null && target != null
    ? weightTargetDiff(Number(latest.weight_kg), target, targetMax)
    : null;
  const rangeModel = latestWeight != null && target != null ? targetRangeModel(latestWeight, target, targetMax) : null;
  const need = requiredPace(latest?.weight_kg ?? null, target, profile?.target_date ?? null);
  const openChart = (key: ChartKey) => {
    setChartKey(key);
    chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const num = (s: string) => s ? parseFloat(s.replace(',', '.')) : null;

  const saveTargets = async () => {
    if (!userId || !hasSupabase) {
      showToast('faça login para salvar objetivos.');
      return;
    }
    setSavingTarget(true);
    const payload = {
      target_weight_kg: num(tWeight),
      target_weight_kg_max: num(tWeightMax),
      target_body_fat_pct: num(tFat),
      target_date: tDate || null,
    };
    const { data, error } = await supabase.from('profiles').update(payload).eq('id', userId).select('*').single();
    if (!error) await saveTargetSnapshot(userId, payload);
    setSavingTarget(false);
    if (error) { console.error(error); showToast('não foi possível salvar.'); return; }
    if (data) setProfile(data as any);
    showToast('objetivo salvo.');
  };

  const submit = async () => {
    if (!userId) { showToast('faça login para salvar medidas.'); return; }
    const fields = {
      weight_kg: num(weight), height_cm: num(height), body_fat_pct: num(fat),
      waist_cm: num(waist), hip_cm: num(hip), chest_cm: num(chest),
      arm_cm: num(arm), thigh_cm: num(thigh), neck_cm: num(neck),
    };
    const hasAny = Object.values(fields).some((v) => v != null) || photo;
    if (!hasAny) { showToast('preencha ao menos um campo.'); return; }
    setSubmitting(true);
    try {
      let saved: BodyMetric | null = null;
      if (photo) {
        const history = metrics.slice(0, 8).map((m) => ({
          date: m.date, weight_kg: m.weight_kg, body_fat_pct: m.body_fat_pct,
        }));
        const prev = metrics.find((m) => m.ai_analysis)?.ai_analysis ?? null;
        const res = await analyzeBodyPhoto({
          file: photo, ...fields, note: note || null, history, previous_analysis: prev,
        });
        const refreshed = await listBodyMetrics(userId);
        setMetrics(refreshed);
        saved = refreshed.find((m) => m.id === res.metric_id) ?? null;
        showToast('foto analisada.');
      } else {
        saved = await saveBodyMetric({ userId, ...fields, note: note || null });
        if (saved) {
          setMetrics((prev) => [saved as BodyMetric, ...prev]);
          showToast('medida registrada · analisando...');
          const analysis = await analyzeBodyProgress(saved.id);
          if (analysis) {
            setMetrics((prev) => prev.map((m) => m.id === saved!.id ? { ...m, ai_analysis: analysis } : m));
            showToast('análise pronta.');
          }
        }
      }
      if (saved) {
        setLatestAnalysisId(saved.id);
        setWeight(''); setFat(''); setWaist(''); setHip(''); setChest('');
        setArm(''); setThigh(''); setNeck(''); setNote(''); setPhoto(null);
      }
    } catch (err) {
      console.error(err); showToast('não foi possível registrar.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    const ok = await deleteBodyMetric(id);
    if (ok) setMetrics((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <section className="card stack">
      {sinceLast != null && sinceLast >= 7 && (
        <div className="t-body-sm muted" style={{ fontStyle: 'italic' }}>
          última medida há {sinceLast} dias · sem pressa, registre quando quiser.
        </div>
      )}

      {latest && (
        <div className="body-metrics-summary">
          <div className="body-metrics-summary__head">
            <div>
              <span className="eyebrow">última medida</span>
              <div className="body-metrics-weight">
                <strong>{latest.weight_kg ?? '?'}<span>kg</span></strong>
              </div>
            </div>
            <button className="body-metrics-date" type="button" onClick={() => objectiveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              {latest.date}
            </button>
          </div>

          <div className="body-metrics-stat-grid">
            {latestBmi != null && (
              <button className="body-metrics-stat" type="button" onClick={() => openChart('bmi')}>
                <span>IMC</span>
                <strong>{latestBmi.toFixed(1)}</strong>
              </button>
            )}
            {latest.body_fat_pct != null && (
              <button className="body-metrics-stat" type="button" onClick={() => openChart('body_fat_pct')}>
                <span>gordura</span>
                <strong>{latest.body_fat_pct}%</strong>
              </button>
            )}
            {latestWhr != null && (
              <button className="body-metrics-stat" type="button" onClick={() => openChart('hip_cm')}>
                <span>cint/quadril</span>
                <strong>{latestWhr.toFixed(2)}</strong>
              </button>
            )}
            {navyEst != null && latest.body_fat_pct == null && (
              <div className="body-metrics-stat">
                <span>gordura est.</span>
                <strong>{navyEst}%</strong>
              </div>
            )}
          </div>

          {rangeModel && targetDiff != null && (
            <div className="body-target-panel">
              <div className="body-target-panel__top">
                <div>
                  <span className="body-target-panel__label">faixa alvo</span>
                  <strong>{target}{targetMax != null ? `–${targetMax}` : ''} kg</strong>
                </div>
                <span className={`body-target-badge ${targetDiff === 0 ? 'body-target-badge--ok' : ''}`}>
                  {targetStatusLabel(targetDiff)}
                </span>
              </div>
              <div className="body-target-track">
                <span className="body-target-range" style={{ left: `${rangeModel.rangeStart}%`, width: `${rangeModel.rangeWidth}%` }} />
                <span className="body-target-marker" style={{ left: `${rangeModel.current}%` }} />
              </div>
              <div className="body-target-panel__bottom">
                <span>{Math.abs(targetDiff).toFixed(1)} kg {targetDiff === 0 ? 'na faixa' : targetDiff > 0 ? 'acima' : 'abaixo'}</span>
                <button type="button" onClick={() => objectiveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>ajustar</button>
              </div>
            </div>
          )}

          {(pace != null || need != null) && (
            <div className="body-pace-row">
              {pace != null && (
                <button className="body-pace-pill" type="button" onClick={() => openChart('weight_kg')}>
                  <span>observado</span>
                  <strong>{formatKgPerWeek(pace)}</strong>
                </button>
              )}
              {need != null && (
                <button className="body-pace-pill body-pace-pill--primary" type="button" onClick={() => objectiveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <span>necessário</span>
                  <strong>{formatRequiredPace(need)}</strong>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* OBJETIVO */}
      <div className="stack" ref={objectiveRef} style={{ gap: 6 }}>
        <span className="eyebrow">objetivo</span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input className="field" style={{ flex: '1 1 120px' }} type="number" inputMode="decimal"
                 placeholder="peso alvo (kg)" value={tWeight} onChange={(e) => setTWeight(e.target.value)} />
          <input className="field" style={{ flex: '1 1 120px' }} type="number" inputMode="decimal"
                 placeholder="faixa máx. (opc)" value={tWeightMax} onChange={(e) => setTWeightMax(e.target.value)} />
          <input className="field" style={{ flex: '1 1 120px' }} type="number" inputMode="decimal"
                 placeholder="% gord alvo (opc)" value={tFat} onChange={(e) => setTFat(e.target.value)} />
          <input className="field" style={{ flex: '1 1 150px' }} type="date"
                 value={tDate} onChange={(e) => setTDate(e.target.value)} aria-label="prazo" />
          <button className="chip" disabled={savingTarget} onClick={() => void saveTargets()}>
            {savingTarget ? 'salvando...' : 'salvar objetivo'}
          </button>
        </div>
      </div>

      {/* REGISTRAR MEDIDA */}
      <div className="stack" style={{ gap: 6 }}>
        <span className="eyebrow">registrar medida</span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input className="field" style={{ flex: '1 1 110px' }} type="number" inputMode="decimal"
                 placeholder="peso (kg)" value={weight} onChange={(e) => setWeight(e.target.value)} />
          <input className="field" style={{ flex: '1 1 110px' }} type="number" inputMode="decimal"
                 placeholder="altura (cm ou m)" value={height} onChange={(e) => setHeight(e.target.value)} />
          <input className="field" style={{ flex: '1 1 110px' }} type="number" inputMode="decimal"
                 placeholder="% gordura (opc)" value={fat} onChange={(e) => setFat(e.target.value)} />
        </div>

        <button className="chip" type="button" onClick={() => setShowMore((v) => !v)} style={{ alignSelf: 'flex-start' }}>
          {showMore ? '— esconder circunferências' : '+ circunferências (opcional)'}
        </button>

        {showMore && (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input className="field" style={{ flex: '1 1 100px' }} type="number" inputMode="decimal"
                   placeholder="cintura cm" value={waist} onChange={(e) => setWaist(e.target.value)} />
            <input className="field" style={{ flex: '1 1 100px' }} type="number" inputMode="decimal"
                   placeholder="quadril cm" value={hip} onChange={(e) => setHip(e.target.value)} />
            <input className="field" style={{ flex: '1 1 100px' }} type="number" inputMode="decimal"
                   placeholder="peito cm" value={chest} onChange={(e) => setChest(e.target.value)} />
            <input className="field" style={{ flex: '1 1 100px' }} type="number" inputMode="decimal"
                   placeholder="braço cm" value={arm} onChange={(e) => setArm(e.target.value)} />
            <input className="field" style={{ flex: '1 1 100px' }} type="number" inputMode="decimal"
                   placeholder="coxa cm" value={thigh} onChange={(e) => setThigh(e.target.value)} />
            <input className="field" style={{ flex: '1 1 100px' }} type="number" inputMode="decimal"
                   placeholder="pescoço cm" value={neck} onChange={(e) => setNeck(e.target.value)} />
          </div>
        )}

        <input className="field" placeholder="nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />

        <label className="row" style={{ gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <span className="chip">{photo ? `foto: ${photo.name.slice(0, 24)}` : 'anexar foto (IA analisa e compara)'}</span>
          {photo && (
            <button className="chip" type="button" onClick={(e) => { e.preventDefault(); setPhoto(null); }}>
              remover
            </button>
          )}
          <input type="file" accept="image/*" style={{ display: 'none' }}
                 onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>

        <button className="btn btn--primary btn--full" disabled={submitting} onClick={() => void submit()}>
          {submitting ? (photo ? 'analisando foto...' : 'salvando...') : (photo ? 'analisar e registrar' : 'registrar medida')}
        </button>
      </div>

      {/* GRÁFICO */}
      <div className="stack" ref={chartRef} style={{ gap: 6 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="eyebrow">evolução</span>
          {CHART_OPTIONS.map((o) => (
            <button key={o.key}
                    className={`chip ${chartKey === o.key ? 'chip--active' : ''}`}
                    onClick={() => setChartKey(o.key)}>
              {o.label}
            </button>
          ))}
        </div>
        <EvolutionChart metrics={metrics} chartKey={chartKey}
                        goal={chartKey === 'weight_kg' ? target : chartKey === 'body_fat_pct' ? (profile?.target_body_fat_pct ?? null) : null}
                        goalMax={chartKey === 'weight_kg' ? targetMax : null} />
      </div>

      {/* COMPARADOR */}
      {metrics.length >= 2 && (
        <Comparator metrics={metrics} compare={compare} setCompare={setCompare} />
      )}

      {loading && <p className="t-body-sm muted">carregando histórico...</p>}

      {metrics.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">histórico</span>
          {metrics.slice(0, 30).map((m) => (
            <MetricRow key={m.id} metric={m} defaultExpanded={m.id === latestAnalysisId}
                       onDelete={() => void remove(m.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function MetricRow({ metric, onDelete, defaultExpanded }: { metric: BodyMetric; onDelete: () => void; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const a = metric.ai_analysis;
  const circ: string[] = [];
  if (metric.waist_cm) circ.push(`cintura ${metric.waist_cm}cm`);
  if (metric.hip_cm) circ.push(`quadril ${metric.hip_cm}cm`);
  if (metric.chest_cm) circ.push(`peito ${metric.chest_cm}cm`);
  if (metric.arm_cm) circ.push(`braço ${metric.arm_cm}cm`);
  if (metric.thigh_cm) circ.push(`coxa ${metric.thigh_cm}cm`);
  if (metric.neck_cm) circ.push(`pescoço ${metric.neck_cm}cm`);

  return (
    <div className="card" style={{ padding: 12, background: 'var(--bone)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <div className="t-body-sm">
            <strong>{metric.weight_kg ?? '?'} kg</strong>
            {metric.body_fat_pct != null && <> · {metric.body_fat_pct}% gord</>}
          </div>
          <div className="t-body-sm muted">{metric.date}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {a && (
            <button className="chip" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'fechar' : 'ver análise'}
            </button>
          )}
          <button className="chip" onClick={onDelete}>remover</button>
        </div>
      </div>

      {circ.length > 0 && (
        <div className="t-body-sm muted" style={{ marginTop: 6 }}>{circ.join(' · ')}</div>
      )}

      {expanded && a && (
        <div className="stack" style={{ marginTop: 10, gap: 6 }}>
          {a.trend && <div className="t-body-sm"><strong>tendência:</strong> {a.trend}</div>}
          {a.fat_distribution?.length > 0 && (
            <div className="t-body-sm"><strong>gordura mais visível em:</strong> {a.fat_distribution.join(', ')}</div>
          )}
          {a.observations?.length > 0 && (
            <ul className="t-body-sm" style={{ margin: 0, paddingLeft: 18 }}>
              {a.observations.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          )}
          {a.suggestions_training?.length > 0 && (
            <div className="t-body-sm"><strong>treino:</strong>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {a.suggestions_training.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </div>
          )}
          {a.suggestions_diet?.length > 0 && (
            <div className="t-body-sm"><strong>dieta:</strong>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {a.suggestions_diet.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {metric.note && <div className="t-body-sm muted" style={{ marginTop: 6 }}>{metric.note}</div>}
    </div>
  );
}

function EvolutionChart({ metrics, chartKey, goal, goalMax }: {
  metrics: BodyMetric[]; chartKey: ChartKey; goal: number | null; goalMax: number | null;
}) {
  const points = useMemo(() => {
    const arr = [...metrics].reverse();
    return arr.map((m) => {
      let v: number | null;
      if (chartKey === 'bmi') v = bmi(m.weight_kg, m.height_cm);
      else v = (m as any)[chartKey] ?? null;
      return { date: m.date, value: v != null ? Number(v) : null, id: m.id };
    }).filter((p) => p.value != null) as { date: string; value: number; id: string }[];
  }, [metrics, chartKey]);

  if (points.length < 2) {
    return <p className="t-body-sm muted">registre 2+ medidas pra ver evolução.</p>;
  }

  const W = 320, H = 140, PAD = 20;
  const values = points.map((p) => p.value);
  const goals = [goal, goalMax].filter((v): v is number => v != null);
  const minV = Math.min(...values, ...goals) - 1;
  const maxV = Math.max(...values, ...goals) + 1;
  const xAt = (i: number) => PAD + (i * (W - 2 * PAD)) / (points.length - 1);
  const yAt = (v: number) => H - PAD - ((v - minV) * (H - 2 * PAD)) / (maxV - minV || 1);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`).join(' ');

  return (
    <div className="stack" style={{ gap: 6 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 140 }}>
        <rect x="0" y="0" width={W} height={H} fill="var(--bone)" rx="8" />
        {goal != null && (
          <line x1={PAD} x2={W - PAD} y1={yAt(goal)} y2={yAt(goal)}
                stroke="var(--camel)" strokeWidth="1" strokeDasharray="3 3" />
        )}
        {goalMax != null && (
          <line x1={PAD} x2={W - PAD} y1={yAt(goalMax)} y2={yAt(goalMax)}
                stroke="var(--camel)" strokeWidth="1" strokeDasharray="3 3" />
        )}
        <path d={path} stroke="var(--chocolate)" strokeWidth="2" fill="none" />
        {points.map((p, i) => (
          <circle key={p.id} cx={xAt(i)} cy={yAt(p.value)} r="2.5" fill="var(--chocolate)" />
        ))}
      </svg>
      <div className="t-body-sm muted">
        {points[0].date} → {points[points.length - 1].date}
        {goal != null && ' · linha tracejada = objetivo'}
      </div>
    </div>
  );
}

function weightTargetDiff(currentKg: number, targetMinKg: number, targetMaxKg: number | null): number {
  if (targetMaxKg == null) return currentKg - targetMinKg;
  if (currentKg < targetMinKg) return currentKg - targetMinKg;
  if (currentKg > targetMaxKg) return currentKg - targetMaxKg;
  return 0;
}

function targetRangeModel(currentKg: number, targetMinKg: number, targetMaxKg: number | null) {
  const targetHigh = targetMaxKg ?? targetMinKg;
  const axisMin = Math.min(targetMinKg, currentKg) - 4;
  const axisMax = Math.max(targetHigh, currentKg) + 4;
  const span = axisMax - axisMin || 1;
  const pct = (value: number) => Math.max(0, Math.min(100, ((value - axisMin) / span) * 100));
  const rangeStart = pct(targetMinKg);
  const rangeEnd = pct(targetHigh);
  return {
    current: pct(currentKg),
    rangeStart,
    rangeWidth: Math.max(2, rangeEnd - rangeStart),
  };
}

function targetStatusLabel(diffKg: number): string {
  if (diffKg === 0) return 'na faixa';
  return diffKg > 0 ? 'acima' : 'abaixo';
}

function formatKgPerWeek(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)} kg/sem`;
}

function formatRequiredPace(value: number): string {
  if (value < 0) return `perder ${Math.abs(value).toFixed(2)} kg/sem`;
  if (value > 0) return `ganhar ${value.toFixed(2)} kg/sem`;
  return 'manter';
}

function Comparator({ metrics, compare, setCompare }: {
  metrics: BodyMetric[];
  compare: { a?: string; b?: string };
  setCompare: (c: { a?: string; b?: string }) => void;
}) {
  const a = metrics.find((m) => m.id === compare.a) ?? metrics[metrics.length - 1];
  const b = metrics.find((m) => m.id === compare.b) ?? metrics[0];

  const diff = (av?: number | null, bv?: number | null) => {
    if (av == null || bv == null) return null;
    const d = Number(bv) - Number(av);
    return (d > 0 ? '+' : '') + d.toFixed(1);
  };

  const row = (label: string, av: number | null | undefined, bv: number | null | undefined, unit: string) => {
    if (av == null && bv == null) return null;
    const d = diff(av, bv);
    return (
      <div className="row t-body-sm" style={{ justifyContent: 'space-between', gap: 8 }}>
        <span className="muted">{label}</span>
        <span>{av ?? '–'}{unit} → {bv ?? '–'}{unit}{d && <strong> ({d})</strong>}</span>
      </div>
    );
  };

  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="eyebrow">comparar duas medidas</span>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <select className="field" style={{ flex: '1 1 140px' }}
                value={a?.id ?? ''} onChange={(e) => setCompare({ ...compare, a: e.target.value })}>
          {metrics.map((m) => <option key={m.id} value={m.id}>{m.date}</option>)}
        </select>
        <select className="field" style={{ flex: '1 1 140px' }}
                value={b?.id ?? ''} onChange={(e) => setCompare({ ...compare, b: e.target.value })}>
          {metrics.map((m) => <option key={m.id} value={m.id}>{m.date}</option>)}
        </select>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        {row('peso', a?.weight_kg, b?.weight_kg, ' kg')}
        {row('%gord', a?.body_fat_pct, b?.body_fat_pct, '%')}
        {row('cintura', a?.waist_cm, b?.waist_cm, ' cm')}
        {row('quadril', a?.hip_cm, b?.hip_cm, ' cm')}
        {row('peito', a?.chest_cm, b?.chest_cm, ' cm')}
        {row('braço', a?.arm_cm, b?.arm_cm, ' cm')}
        {row('coxa', a?.thigh_cm, b?.thigh_cm, ' cm')}
      </div>
    </div>
  );
}
