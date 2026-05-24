import { useEffect, useRef, useState } from 'react';
import { BackButton } from '../components/BackButton';
import { geminiChat } from '../lib/gemini';
import { isoToday } from '../lib/dates';
import { readJson, writeJson, scopedStorageKey } from '../lib/storage';
import { loadConversation, saveConversation } from '../lib/chatService';
import { hasSupabase } from '../lib/supabase';
import { useApp } from '../store/useStore';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

const starterMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content: 'Estou aqui. Me conte o que o corpo, a pele ou a cabeça estão tentando dizer hoje.',
    at: isoToday(),
  },
];

export function Chat() {
  const focusedDimension = useApp((s) => s.focusedDimension);
  const userId = useApp((s) => s.userId);
  const chatKey = scopedStorageKey('full-ritual-chat', userId ?? '');
  const [messages, setMessagesState] = useState<ChatMessage[]>(() => readJson(chatKey, starterMessages));
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setMessages = (updater: ((prev: ChatMessage[]) => ChatMessage[]) | ChatMessage[]) => {
    setMessagesState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      writeJson(chatKey, next);

      if (hasSupabase && userId) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          saveConversation(userId, next).catch(console.error);
        }, 1200);
      }

      return next;
    });
  };

  // Load conversation from Supabase on mount
  useEffect(() => {
    if (!hasSupabase || !userId) return;
    loadConversation(userId)
      .then((msgs) => {
        if (msgs.length) {
          setMessagesState(msgs);
          writeJson(chatKey, msgs);
        }
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const send = async () => {
    const text = draft.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      at: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setLoading(true);

    try {
      const response = await geminiChat(text, {
        focus_dimension: focusedDimension,
        recent_summary: messages.slice(-6).map((message) => `${message.role}: ${message.content}`).join('\n'),
      });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.reply,
          at: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error(error);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Não consegui acessar a IA agora. Registre o que aconteceu; a leitura volta quando a conexão estiver pronta.',
          at: new Date().toISOString(),
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
        <span className="eyebrow">chat IA · ritual</span>
        <h1 className="t-display-lg">
          Conversa com <em className="t-display-italic">presença.</em>
        </h1>
      </header>

      <section className="chat-thread" aria-live="polite">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`bubble ${message.role === 'user' ? 'bubble--me' : 'bubble--ai'}`}
          >
            {message.content}
          </article>
        ))}
        {loading && <article className="bubble bubble--ai">lendo seus registros…</article>}
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
          placeholder="escreva uma pergunta ou sensação"
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
