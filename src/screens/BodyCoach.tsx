import { useEffect, useRef, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { CyclePhaseBanner } from '../components/CyclePhaseBanner';
import { isoToday } from '../lib/dates';
import { useApp } from '../store/useStore';
import {
  type BodyCoachMessage,
  fetchBodyCoachHistory,
  sendBodyCoachMessage,
} from '../lib/bodyCoach';

export function BodyCoach() {
  const userId = useApp((s) => s.userId);
  const showToast = useApp((s) => s.showToast);
  const [messages, setMessages] = useState<BodyCoachMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const threadRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!userId) {
      setLoadingHistory(false);
      return;
    }
    let alive = true;
    void fetchBodyCoachHistory(userId).then((rows) => {
      if (!alive) return;
      setMessages(rows);
      setLoadingHistory(false);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async () => {
    const text = draft.trim();
    if (!text || loading) return;
    const optimistic: BodyCoachMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setDraft('');
    setLoading(true);

    try {
      const { reply, diet_additions } = await sendBodyCoachMessage(text);
      setMessages((current) => [
        ...current,
        {
          id: `local-reply-${Date.now()}`,
          role: 'assistant',
          content: reply,
          created_at: new Date().toISOString(),
          metadata: diet_additions?.length ? { diet_additions } : null,
        },
      ]);
      if (diet_additions?.length) {
        showToast(`IA adicionou ${diet_additions.length} item(ns) na dieta.`);
      }
    } catch (error) {
      console.error(error);
      setMessages((current) => [
        ...current,
        {
          id: `local-error-${Date.now()}`,
          role: 'assistant',
          content: 'Não consegui responder agora. Tenta de novo em instantes.',
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen chat-screen">
      <header className="screen-header stack">
        <BackButton />
        <span className="eyebrow">IA coach · treino</span>
        <h1 className="t-display-lg">
          Conversa com a <em className="t-display-italic">treinadora.</em>
        </h1>
        <p className="t-body muted">
          Triatlo, força, periodização. Pergunte, ajuste, justifique. Histórico fica salvo.
        </p>
      </header>

      <CyclePhaseBanner context="body" date={isoToday()} />

      <section ref={threadRef} className="chat-thread" aria-live="polite">
        {loadingHistory && <article className="bubble bubble--ai body-coach-bubble">carregando histórico...</article>}
        {!loadingHistory && messages.length === 0 && (
          <article className="bubble bubble--ai body-coach-bubble">
            Sou a IA coach do seu treino. Posso explicar a sessão de hoje, ajustar carga, propor
            um bloco de força, ou rever a periodização da semana. Por onde quer começar?
          </article>
        )}
        {messages.map((message) => (
          <article
            key={message.id}
            className={`bubble ${message.role === 'user' ? 'bubble--me' : 'bubble--ai body-coach-bubble'}`}
          >
            {message.role === 'user' ? message.content : <CoachMessageContent content={message.content} />}
            {message.metadata && (message.metadata as any).diet_additions && (
              <div className="body-coach-diet-pill">
                ↳ adicionado na dieta · {(message.metadata as any).diet_additions.length} item(ns)
              </div>
            )}
          </article>
        ))}
        {loading && <article className="bubble bubble--ai body-coach-bubble">pensando na sessão...</article>}
      </section>

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          className="field"
          rows={2}
          placeholder="ex: posso trocar o longão de domingo por bike?"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="btn btn--primary" type="submit" disabled={loading || !draft.trim()}>
          enviar
        </button>
      </form>
    </div>
  );
}

function CoachMessageContent({ content }: { content: string }) {
  const blocks = content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="coach-message-content">
      {blocks.map((block, index) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
        const firstLineHeading = lines[0]?.match(/^#{1,4}\s+(.+)$/);

        if (firstLineHeading) {
          const title = stripInlineMarkdown(firstLineHeading[1]);
          const bodyLines = lines.slice(1);
          return (
            <section key={`${title}-${index}`} className="coach-message-section">
              <h2>
                <span aria-hidden>{headingIcon(title)}</span>
                {renderInline(firstLineHeading[1])}
              </h2>
              {bodyLines.length > 0 && renderTextLines(bodyLines)}
            </section>
          );
        }

        return <div key={`block-${index}`}>{renderTextLines(lines)}</div>;
      })}
    </div>
  );
}

function renderTextLines(lines: string[]) {
  const isList = lines.every((line) => /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line));
  if (isList) {
    return (
      <ul>
        {lines.map((line, lineIndex) => (
          <li key={`${line}-${lineIndex}`}>
            {renderInline(line.replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, ''))}
          </li>
        ))}
      </ul>
    );
  }

  return <p>{renderInline(lines.join(' '))}</p>;
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function stripInlineMarkdown(text: string) {
  return text.replace(/\*\*/g, '');
}

function headingIcon(title: string) {
  const normalized = stripInlineMarkdown(title)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized.includes('objetivo')) return '◇';
  if (normalized.includes('racional')) return '∴';
  if (normalized.includes('estrutura')) return '▦';
  if (normalized.includes('execucao') || normalized.includes('indicador')) return '✓';
  if (normalized.includes('alerta')) return '!';
  if (normalized.includes('dieta') || normalized.includes('alimentacao')) return '+';
  return '•';
}
