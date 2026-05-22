import { BodyMetricsSection } from '../components/BodyMetricsSection';

export function BodyMetrics() {
  return (
    <div className="screen stack-md">
      <header className="stack">
        <span className="eyebrow">configuração · corpo</span>
        <h1 className="t-display-lg">
          peso, altura e <em className="t-display-italic">composição</em>.
        </h1>
        <p className="t-body muted">
          registre quando quiser — sem data fixa. a foto vai pra IA, é analisada e descartada.
          peso e %gordura entram nas sugestões de treino e dieta.
        </p>
      </header>

      <BodyMetricsSection />

      <div style={{ height: 40 }} />
    </div>
  );
}
