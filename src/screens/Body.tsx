import { useApp } from '../store/useStore';

export function Body() {
  const goTo = useApp((s) => s.goTo);

  return (
    <div className="screen stack-md body-screen">
      <section className="body-hero">
        <span className="eyebrow">corpo · treino</span>
        <h1>
          Treino como parte do <em>ritual.</em>
        </h1>
        <p>
          Este espaço vai concentrar modalidade, treino do dia, intensidade, recuperação e observações.
        </p>
      </section>

      <section className="card stack">
        <span className="eyebrow">em breve · corpo</span>
        <p className="t-body muted">
          Por enquanto, mantive este menu como base limpa para receber a dimensão de treino sem misturar com pele.
        </p>
        <button className="btn btn--secondary btn--full" onClick={() => goTo('diet')}>
          abrir dieta e treino do dia
        </button>
      </section>
    </div>
  );
}
