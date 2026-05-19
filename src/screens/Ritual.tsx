import { useState } from 'react';
import { PresenceSlider } from '../components/PresenceSlider';
import { useApp } from '../store/useStore';
import { supabase, hasSupabase } from '../lib/supabase';

const SIGNAL_TAGS = [
  'cabeça pesada', 'fome', 'tensão nos ombros', 'ansiedade leve',
  'sede', 'cansaço', 'frio', 'calor', 'inquietação', 'paz',
];

export function Ritual() {
  const showToast = useApp((s) => s.showToast);
  const goTo = useApp((s) => s.goTo);
  const userId = useApp((s) => s.userId);

  const [energy, setEnergy] = useState(6);
  const [calm, setCalm] = useState(5);
  const [skinState, setSkinState] = useState(7);
  const [bodyState, setBodyState] = useState(6);
  const [signals, setSignals] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleSignal = (s: string) => {
    setSignals((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      if (hasSupabase && userId) {
        const today = new Date().toISOString().slice(0, 10);
        const { error } = await supabase.from('checkins').insert({
          user_id: userId,
          date: today,
          energy,
          calm,
          skin_state: skinState,
          body_state: bodyState,
          signals,
          note: note || null,
        });
        if (error) throw error;
      }
      showToast('momento guardado.');
      goTo('home');
    } catch (e) {
      showToast('não foi possível guardar agora.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">check-in rápido</span>
        <h1 className="t-display-lg">
          Como você está, <em className="t-display-italic">agora?</em>
        </h1>
        <p className="t-body muted">
          Quatro medidas rápidas. Sem certo nem errado — só o que estiver presente.
        </p>
      </header>

      <section className="card stack">
        <PresenceSlider label="energia" value={energy} onChange={setEnergy} color="var(--body)" />
        <div className="divider" />
        <PresenceSlider label="calma" value={calm} onChange={setCalm} color="var(--mind)" />
        <div className="divider" />
        <PresenceSlider label="pele" value={skinState} onChange={setSkinState} color="var(--skin)" />
        <div className="divider" />
        <PresenceSlider label="corpo" value={bodyState} onChange={setBodyState} color="var(--diet)" />
      </section>

      <section className="stack">
        <span className="eyebrow">sinais do corpo</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SIGNAL_TAGS.map((s) => (
            <button
              key={s}
              className={`chip ${signals.includes(s) ? 'chip--active' : ''}`}
              onClick={() => toggleSignal(s)}
              aria-pressed={signals.includes(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="stack">
        <span className="eyebrow">uma observação · opcional</span>
        <textarea
          className="field"
          rows={3}
          placeholder="alguma coisa que você quer deixar registrada do dia…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </section>

      <button
        className="btn btn--primary btn--full"
        onClick={save}
        disabled={saving}
      >
        {saving ? 'guardando…' : 'guardar este momento'}
      </button>

      <div style={{ height: 24 }} />
    </div>
  );
}
