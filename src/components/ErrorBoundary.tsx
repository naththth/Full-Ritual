import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Full Ritual] Erro de renderizacao capturado.', error, info);
  }

  private reload = () => {
    window.location.reload();
  };

  private resetLocalSession = () => {
    try {
      localStorage.removeItem('full-ritual-session');
    } catch (error) {
      console.warn('[Full Ritual] Nao foi possivel limpar a sessao local.', error);
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100dvh',
          background: 'var(--ivory)',
          color: 'var(--chocolate)',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
        }}
      >
        <div className="card stack" style={{ width: 'min(100%, 390px)' }}>
          <p className="eyebrow">recuperacao</p>
          <h1 className="t-display-md" style={{ margin: 0 }}>O ritual travou por aqui.</h1>
          <p className="t-body muted" style={{ margin: 0 }}>
            Recarregue a tela. Se continuar, limpe apenas a sessao local para entrar de novo sem apagar seus registros salvos.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={this.reload}>recarregar</button>
            <button className="btn btn--secondary" onClick={this.resetLocalSession}>limpar sessao</button>
          </div>
        </div>
      </div>
    );
  }
}
