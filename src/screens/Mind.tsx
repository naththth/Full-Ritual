import { useEffect, useMemo, useState } from 'react';
import { BookThumb } from '../components/BookThumb';
import { searchBookSuggestions } from '../lib/bookSearch';
import { geminiChat } from '../lib/gemini';
import { relativeDateLabel } from '../lib/dates';
import { bookCoverSrc, mergeReadingBooks, readingProgress } from '../lib/reading';
import { useLocalState } from '../lib/useLocalState';
import { hasSupabase, supabase } from '../lib/supabase';
import { scopedStorageKey } from '../lib/storage';
import { useApp } from '../store/useStore';
import type { ContentPref, MindLog, ReadingBook, ReadingSession } from '../types';

type MindType = MindLog['type'];
type SoundFeedback = 'liked' | 'disliked' | '';

interface PracticeLog {
  duration: string;
  feeling: string;
  notes: string;
}

interface MindState {
  selectedPractices: MindType[];
  activePractice: MindType;
  practiceLogs: Partial<Record<MindType, PracticeLog>>;
  resourceChecks: Record<string, boolean>;
  bookTitle: string;
  currentPage: string;
  totalPages: string;
  selectedBookId: string;
  pagesRead: string;
  soundFeedback: SoundFeedback;
  aiNote: string;
}

interface PracticeSuggestion {
  title: string;
  detail: string;
  action: string;
  link?: string;
  linkLabel?: string;
}

interface ResourceSuggestion {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  link: string;
  linkLabel: string;
}

interface MindSuggestionItem {
  kind: string;
  short: string;
  label: string;
  value: string;
  instruction?: string;
  href?: string;
  practice?: MindType;
}

const initialMind: MindState = {
  selectedPractices: ['foco'],
  activePractice: 'foco',
  practiceLogs: {
    foco: { duration: '25', feeling: 'clara', notes: '' },
  },
  resourceChecks: {},
  bookTitle: '',
  currentPage: '',
  totalPages: '',
  selectedBookId: '',
  pagesRead: '',
  soundFeedback: '',
  aiNote: '',
};

const PRACTICES: { value: MindType; label: string }[] = [
  { value: 'foco', label: 'Foco' },
  { value: 'leitura', label: 'Leitura' },
  { value: 'som', label: 'Som' },
  { value: 'meditacao', label: 'Meditação' },
  { value: 'pausa', label: 'Pausa' },
];

const FEELINGS = ['clara', 'calma', 'dispersa', 'ansiosa', 'cansada', 'leve'];

const DURATION_OPTIONS: Record<MindType, string[]> = {
  foco: ['15', '25', '50'],
  leitura: ['10', '15', '30'],
  som: ['15', '20', '40'],
  meditacao: ['5', '10', '15'],
  pausa: ['1', '3', '5'],
};

const PAGES_READ_OPTIONS = ['5', '10', '15', '20', '30'];

const NOTE_PRESETS: Record<MindType, string[]> = {
  foco: ['sem troca de aba', 'comecei com resistência', 'clareou depois de alguns minutos', 'preciso quebrar menor'],
  leitura: ['li com calma', 'avancei pouco mas avancei', 'quero continuar esse trecho', 'difícil manter atenção'],
  som: ['ajudou o foco', 'ficou invasivo', 'bom para começo do bloco', 'melhor em volume baixo'],
  meditacao: ['mente acelerada', 'voltei para a respiração', 'corpo relaxou', 'sono apareceu'],
  pausa: ['usei antes de responder', 'baixou a urgência', 'preciso repetir mais cedo', 'foi suficiente'],
};

const MENTAL_MODELS = [
  ['Inversão', 'https://fs.blog/inversion/'],
  ['Segunda ordem', 'https://fs.blog/second-order-thinking/'],
  ['Círculo de competência', 'https://fs.blog/circle-of-competence/'],
  ['Mapa não é território', 'https://fs.blog/map-and-territory/'],
  ['Pensamento probabilístico', 'https://fs.blog/probabilistic-thinking/'],
  ['Margem de segurança', 'https://fs.blog/margin-of-safety/'],
  ['Navalha de Occam', 'https://fs.blog/occams-razor/'],
] as const;

const HABITS = [
  'deixar água visível antes de abrir o computador',
  'ler uma página antes de tocar no celular',
  'anotar a primeira tarefa antes de responder mensagens',
  'fazer três respirações antes de trocar de aba',
  'preparar o ambiente de sono antes das 22h',
  'guardar o celular fora da cama',
  'terminar o dia com uma frase de fechamento',
];

const BREATHING = [
  ['Box breathing 4-4-4-4', 'https://www.youtube.com/results?search_query=box+breathing+4+4+4+4'],
  ['Respiração 4-7-8', 'https://www.youtube.com/results?search_query=4-7-8+breathing+guided'],
  ['Coherent breathing', 'https://www.youtube.com/results?search_query=coherent+breathing+5+minutes'],
  ['Physiological sigh', 'https://www.youtube.com/results?search_query=physiological+sigh+breathing'],
] as const;

const LEARNING_BY_PREF: Record<ContentPref, string[]> = {
  longevidade: ['zona 2 e saúde metabólica', 'músculo como reserva de longevidade', 'sono e reparo celular'],
  neurociencia: ['atenção seletiva', 'dopamina e motivação', 'memória de trabalho'],
  filosofia: ['estoicismo aplicado', 'desejo mimético', 'ética do cuidado'],
  performance: ['deep work', 'gestão de energia', 'rotina pré-tarefa'],
  literatura: ['ensaio pessoal', 'poesia contemporânea', 'como ler melhor um romance'],
  ciencia: ['método científico', 'viés de confirmação', 'clima e saúde'],
  negocios: ['estratégia em uma página', 'vantagem competitiva', 'tomada de decisão'],
  arte: ['história da cor', 'olhar curatorial', 'fotografia como linguagem'],
};

export function Mind() {
  const userId = useApp((s) => s.userId);
  const profile = useApp((s) => s.profile);
  const showToast = useApp((s) => s.showToast);
  const selectedDate = useApp((s) => s.selectedDate);
  const goTo = useApp((s) => s.goTo);
  const [mind, setMind] = useLocalState<MindState>(scopedStorageKey(`full-ritual-mind-${selectedDate}`, userId), initialMind);
  const [readingBooks, setReadingBooks] = useLocalState<ReadingBook[]>(scopedStorageKey('full-ritual-reading-books', userId), []);
  const [, setReadingSessions] = useLocalState<ReadingSession[]>(scopedStorageKey('full-ritual-reading-sessions', userId), []);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const dateLabel = relativeDateLabel(selectedDate);
  const dayIndex = new Date(`${selectedDate}T12:00:00`).getDay();
  const selectedPractices = mind.selectedPractices;
  const activePractice = selectedPractices.includes(mind.activePractice)
    ? mind.activePractice
    : selectedPractices[0] ?? 'foco';
  const activeBook = useMemo(
    () =>
      readingBooks.find((book) => book.id === mind.selectedBookId) ??
      readingBooks.find((book) => book.status === 'reading') ??
      readingBooks.find((book) => book.status === 'want_to_read') ??
      readingBooks[0] ??
      null,
    [mind.selectedBookId, readingBooks],
  );

  useEffect(() => {
    if (!hasSupabase || !userId) return;
    void supabase
      .from('reading_books')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          return;
        }
        if (data?.length) setReadingBooks((current) => mergeReadingBooks(current, data as ReadingBook[]));
      });
  }, [setReadingBooks, userId]);

  useEffect(() => {
    const missingCovers = readingBooks
      .filter((book) => !bookCoverSrc(book) && book.title && book.author)
      .slice(0, 5);
    if (!missingCovers.length) return;

    let cancelled = false;
    void Promise.all(
      missingCovers.map(async (book) => {
        const [suggestion] = await searchBookSuggestions(book.title, book.author);
        return suggestion?.coverUrl ? { bookId: book.id, suggestion } : null;
      })
    ).then((matches) => {
      if (cancelled) return;
      const validMatches = matches.filter(Boolean);
      if (!validMatches.length) return;

      setReadingBooks((current) =>
        current.map((book) => {
          const match = validMatches.find((item) => item?.bookId === book.id);
          if (!match) return book;
          return {
            ...book,
            isbn: book.isbn ?? match.suggestion.isbn,
            isbn13: book.isbn13 ?? match.suggestion.isbn13,
            pages: book.pages ?? match.suggestion.pages,
            publisher: book.publisher ?? match.suggestion.publisher,
            cover_url: match.suggestion.coverUrl,
            updated_at: new Date().toISOString(),
          };
        })
      );
    }).catch((error: Error) => {
      if (error.name !== 'AbortError') console.error(error);
    });

    return () => {
      cancelled = true;
    };
  }, [readingBooks, setReadingBooks]);

  const suggestions = useMemo(
    () => buildPracticeSuggestions(selectedDate, profile?.music_prefs ?? []),
    [profile?.music_prefs, selectedDate],
  );
  const resources = useMemo(
    () => buildResourceSuggestions(dayIndex, profile?.content_prefs ?? []),
    [dayIndex, profile?.content_prefs],
  );
  const selectedResourcesCount = resources.filter((resource) => mind.resourceChecks[resource.id]).length;

  const update = <K extends keyof MindState>(key: K, value: MindState[K]) => {
    setMind((current) => ({ ...current, [key]: value }));
  };

  const togglePractice = (type: MindType) => {
    setMind((current) => {
      const selected = current.selectedPractices.includes(type);
      const nextSelected = selected
        ? current.selectedPractices.filter((item) => item !== type)
        : [...current.selectedPractices, type];
      const nextActivePractice = selected
        ? current.activePractice === type ? nextSelected[0] ?? 'foco' : current.activePractice
        : type;

      return {
        ...current,
        selectedPractices: nextSelected,
        activePractice: nextActivePractice,
        practiceLogs: {
          ...current.practiceLogs,
          [type]: current.practiceLogs[type] ?? defaultPracticeLog(type),
        },
      };
    });
  };

  const updatePracticeLog = (type: MindType, patch: Partial<PracticeLog>) => {
    setMind((current) => ({
      ...current,
      practiceLogs: {
        ...current.practiceLogs,
        [type]: {
          ...defaultPracticeLog(type),
          ...(current.practiceLogs[type] ?? {}),
          ...patch,
        },
      },
    }));
  };

  const toggleResource = (id: string) => {
    setMind((current) => ({
      ...current,
      resourceChecks: { ...current.resourceChecks, [id]: !current.resourceChecks[id] },
    }));
  };

  const refreshAiSuggestions = async () => {
    setAiLoading(true);
    try {
      const response = await geminiChat(
        [
          'Sugira um plano mental curto para hoje.',
          `Data relativa: ${dateLabel}.`,
          activeBook ? `Livro atual: ${activeBook.title}, de ${activeBook.author}.` : 'Livro atual: não definido.',
          `Práticas selecionadas: ${selectedPractices.join(', ') || 'nenhuma'}.`,
          `Preferências de conteúdo: ${(profile?.content_prefs ?? []).join(', ') || 'sem preferência definida'}.`,
          `Preferências musicais: ${(profile?.music_prefs ?? []).join(', ') || 'sem preferência definida'}.`,
          'Responda em português, em 4 bullets curtos: foco, som, pausa e repertório.',
          'Cada bullet deve ter apenas um nome e uma frase curta. Não explique o passo a passo.',
        ].join('\n'),
        { focus_dimension: 'mind' },
      );
      update('aiNote', response.reply);
    } catch (error) {
      console.error(error);
      showToast('não consegui regenerar com IA agora.');
    } finally {
      setAiLoading(false);
    }
  };

  const registerReadingProgressFromMind = async () => {
    if (!activeBook || !selectedPractices.includes('leitura')) return;

    const pagesRead = Number(mind.pagesRead || mind.currentPage);
    if (!Number.isFinite(pagesRead) || pagesRead <= 0) return;

    const log = { ...defaultPracticeLog('leitura'), ...(mind.practiceLogs.leitura ?? {}) };
    const endPage = activeBook.current_page + pagesRead;
    const safeEndPage = activeBook.pages ? Math.min(endPage, activeBook.pages) : endPage;
    const now = new Date().toISOString();
    const nextStatus = activeBook.pages && safeEndPage >= activeBook.pages ? 'read' : 'reading';
    const session: ReadingSession = {
      id: crypto.randomUUID(),
      user_id: userId ?? undefined,
      book_id: activeBook.id,
      date: selectedDate,
      start_page: activeBook.current_page || null,
      end_page: safeEndPage || null,
      pages_read: Math.max(0, safeEndPage - activeBook.current_page),
      minutes: Number(log.duration) || null,
      feeling: log.feeling,
      notes: log.notes || null,
      created_at: now,
    };
    const updatedBook: ReadingBook = {
      ...activeBook,
      current_page: safeEndPage,
      status: nextStatus,
      date_read: nextStatus === 'read' ? selectedDate : activeBook.date_read,
      updated_at: now,
    };

    setReadingBooks((current) =>
      current.map((book) => (book.id === activeBook.id ? updatedBook : book))
    );
    setReadingSessions((current) => [session, ...current]);

    if (hasSupabase && userId) {
      await supabase.from('reading_books').upsert({ ...updatedBook, user_id: userId }, { onConflict: 'user_id,id' });
      await supabase.from('reading_sessions').insert({ ...session, user_id: userId });
    }
  };

  const save = async () => {
    if (!selectedPractices.length) {
      showToast('selecione pelo menos uma prática.');
      return;
    }

    setSaving(true);
    try {
      await registerReadingProgressFromMind();

      if (hasSupabase && userId) {
        const resourceNotes = resources
          .filter((resource) => mind.resourceChecks[resource.id])
          .map((resource) => resource.title);

        const rows = selectedPractices.map((type) => {
          const log = { ...defaultPracticeLog(type), ...(mind.practiceLogs[type] ?? {}) };
          return {
            user_id: userId,
            date: selectedDate,
            type,
            duration_min: type === 'pausa' ? null : Number(log.duration) || null,
            content_ref: contentRefFor(type, mind, suggestions[type], activeBook),
            notes: [
              type === 'pausa' ? '' : `sensação: ${log.feeling}`,
              log.notes,
              type === 'som' && mind.soundFeedback ? `feedback som: ${mind.soundFeedback}` : '',
              resourceNotes.length ? `repertório: ${resourceNotes.join('; ')}` : '',
              mind.aiNote ? `IA: ${mind.aiNote}` : '',
            ].filter(Boolean).join('\n'),
          };
        });

        const { error } = await supabase
          .from('mind_logs')
          .upsert(rows, { onConflict: 'user_id,date,type' });
        if (error) throw error;
      }
      showToast('mente guardada.');
    } catch (error) {
      console.error(error);
      showToast('não foi possível salvar mente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen stack-md mind-screen">
      <section className="mind-hero">
        <span className="eyebrow">mente · {dateLabel}</span>
        <h1>
          Volte mais lento do que <em>partiu.</em>
        </h1>
        <p>
          Escolha uma ou mais práticas. Cada uma registra duração, sensação e observação para alimentar os insights.
        </p>
        <div className="mind-score">
          <strong>{selectedPractices.length}/{PRACTICES.length}</strong>
          <span>práticas escolhidas</span>
        </div>
      </section>

      <section className="card stack mind-day-suggestion">
        <div className="row-between">
          <span className="eyebrow">sugestão do dia</span>
          <button className="chip" onClick={refreshAiSuggestions} disabled={aiLoading}>
            {aiLoading ? 'gerando' : 'regenerar'}
          </button>
        </div>
        <div className="mind-suggestion-list">
          {(mind.aiNote ? parseAiSuggestions(mind.aiNote, suggestions, resources) : localSuggestionItems(suggestions, resources)).map((item) => {
            const content = (
              <>
                <span className="mind-suggestion-mark" aria-hidden="true">{item.short}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.value}</small>
                  {item.instruction && <em>{item.instruction}</em>}
                </span>
                <i aria-hidden="true">›</i>
              </>
            );
            const className = `mind-suggestion-item mind-suggestion-item--${item.kind}`;

            return item.href ? (
              <a className={className} href={item.href} target="_blank" rel="noreferrer" key={`${item.kind}-${item.label}`}>
                {content}
              </a>
            ) : (
              <button
                className={className}
                key={`${item.kind}-${item.label}`}
                onClick={() => {
                  if (item.practice && !selectedPractices.includes(item.practice)) togglePractice(item.practice);
                  if (item.practice) update('activePractice', item.practice);
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      </section>

      <details className="mind-panel card stack" open>
        <summary>
          <span>
            <span className="eyebrow">práticas</span>
            <strong>{selectedPractices.length ? `${selectedPractices.length} escolhidas` : 'escolher práticas'}</strong>
          </span>
        </summary>

        <div className="mind-panel-body">
          <div className="mind-type-grid">
            {PRACTICES.map((practice) => {
              const suggestion = suggestions[practice.value];
              const selected = selectedPractices.includes(practice.value);
              return (
                <button
                  key={practice.value}
                  className={`mind-type ${selected ? 'mind-type--active' : ''}`}
                  onClick={() => togglePractice(practice.value)}
                  aria-pressed={selected}
                >
                  <strong>{practice.label}</strong>
                  <span>{suggestion.detail}</span>
                </button>
              );
            })}
          </div>

          {selectedPractices.length > 1 && (
            <div className="practice-session-tabs" aria-label="Prática ativa">
              {selectedPractices.map((type) => (
                <button
                  key={type}
                  className={`practice-session-tab practice-session-tab--${type} ${activePractice === type ? 'practice-session-tab--active' : ''}`}
                  onClick={() => update('activePractice', type)}
                >
                  {practiceLabel(type)}
                </button>
              ))}
            </div>
          )}

          {selectedPractices.length === 0 && (
            <p className="t-body-sm muted">Escolha uma prática para registrar mente de hoje.</p>
          )}

          {selectedPractices.includes(activePractice) && ([activePractice] as MindType[]).map((type) => {
            const suggestion = suggestions[type];
            const log = { ...defaultPracticeLog(type), ...(mind.practiceLogs[type] ?? {}) };
            const readingProgressValue = activeBook ? readingProgress(activeBook) : 0;

            return (
              <div className="practice-detail" key={type}>
                <div>
                  <span className="eyebrow">{practiceLabel(type)}</span>
                  {type !== 'som' && <h2>{type === 'leitura' ? 'Leitura de hoje' : suggestion.title}</h2>}
                  {type !== 'pausa' && type !== 'som' && (
                    <p>
                      {type === 'leitura' && activeBook
                        ? 'Escolha um livro da Biblioteca e registre quantas páginas leu hoje.'
                        : suggestion.action}
                    </p>
                  )}
                  {suggestion.link && type !== 'som' && !(type === 'leitura' && activeBook) && (
                    <a href={suggestion.link} target="_blank" rel="noreferrer">
                      {suggestion.linkLabel ?? 'abrir'}
                    </a>
                  )}
                </div>

              {type === 'som' && (
                <div className="sound-suggestion-card">
                  <span className="eyebrow">playlist · hoje</span>
                  <strong>{suggestion.title}</strong>
                  <p>Use essa indicação como trilha do bloco. Seu feedback calibra as próximas sugestões.</p>
                  <div className="sound-action-row">
                    <a href={suggestion.link} target="_blank" rel="noreferrer">tocar playlist</a>
                    <button
                      className={mind.soundFeedback === 'liked' ? 'sound-feedback--active' : ''}
                      onClick={() => update('soundFeedback', 'liked')}
                    >
                      gostei
                    </button>
                    <button
                      className={mind.soundFeedback === 'disliked' ? 'sound-feedback--active' : ''}
                      onClick={() => update('soundFeedback', 'disliked')}
                    >
                      não gostei
                    </button>
                  </div>
                </div>
              )}

              {type === 'leitura' && (
                activeBook ? (
                  <div className="current-book-card">
                    <BookPicker
                      books={readingBooks}
                      activeBook={activeBook}
                      onSelect={(book) => {
                        update('selectedBookId', book.id);
                      }}
                    />
                    <div>
                      <div className="row-between">
                        <span className="eyebrow">progresso</span>
                        <strong>{readingProgressValue}%</strong>
                      </div>
                      <div className="book-progress book-progress--mind">
                        <span style={{ width: `${readingProgressValue}%` }} />
                      </div>
                      <p className="book-progress-copy">
                        {activeBook.pages
                          ? `página ${activeBook.current_page} de ${activeBook.pages}`
                          : `página atual ${activeBook.current_page}`}
                      </p>
                    </div>
                    <div className="reading-action-grid">
                      <QuickChoices
                        label="páginas hoje"
                        options={PAGES_READ_OPTIONS}
                        value={mind.pagesRead}
                        onChange={(value) => update('pagesRead', value)}
                      />
                      <button className="chip" onClick={() => goTo('library')}>
                        abrir biblioteca
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="reading-grid">
                    <input
                      className="field"
                      placeholder="livro atual"
                      value={mind.bookTitle}
                      onChange={(event) => update('bookTitle', event.target.value)}
                    />
                    <QuickChoices
                      label="páginas hoje"
                      options={PAGES_READ_OPTIONS}
                      value={mind.currentPage}
                      onChange={(value) => update('currentPage', value)}
                    />
                    <button className="chip" onClick={() => goTo('library')}>
                      cadastrar livro
                    </button>
                  </div>
                )
              )}

              {type !== 'pausa' && type !== 'som' && (
                <>
                  <div className="practice-log-grid">
                    <QuickChoices
                      label="duração"
                      options={DURATION_OPTIONS[type]}
                      value={log.duration}
                      suffix="min"
                      onChange={(value) => updatePracticeLog(type, { duration: value })}
                    />
                    <label className="compact-field">
                      <span>como me senti</span>
                      <select
                        value={log.feeling}
                        onChange={(event) => updatePracticeLog(type, { feeling: event.target.value })}
                      >
                        {FEELINGS.map((feeling) => (
                          <option key={feeling} value={feeling}>{feeling}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="compact-field">
                    <span>observação</span>
                    <select
                      value={log.notes}
                      onChange={(event) => updatePracticeLog(type, { notes: event.target.value })}
                    >
                      <option value="">sem observação</option>
                      {NOTE_PRESETS[type].map((note) => (
                        <option key={note} value={note}>{note}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              </div>
            );
          })}
        </div>
      </details>

      <details className="mind-panel card stack">
        <summary>
          <span>
            <span className="eyebrow">repertório</span>
            <strong>
              {selectedResourcesCount
                ? `${selectedResourcesCount} selecionados`
                : 'sugestões do dia'}
            </strong>
          </span>
        </summary>
        <div className="mind-panel-body">
          <div className="resource-list">
            {resources.map((resource) => (
              <article
                key={resource.id}
                className={`resource-row ${mind.resourceChecks[resource.id] ? 'resource-row--active' : ''}`}
              >
                <div className="resource-row-main">
                  <button
                    className="resource-check"
                    onClick={() => toggleResource(resource.id)}
                    aria-pressed={Boolean(mind.resourceChecks[resource.id])}
                    aria-label={`marcar ${resource.title}`}
                  >
                    <span className="task-check">{mind.resourceChecks[resource.id] ? '✓' : ''}</span>
                  </button>
                  <button className="resource-content" onClick={() => toggleResource(resource.id)}>
                    <strong>{resource.title}</strong>
                    <small>{resource.subtitle}</small>
                    <em>{resource.detail}</em>
                  </button>
                </div>
                <a href={resource.link} target="_blank" rel="noreferrer">{resource.linkLabel}</a>
              </article>
            ))}
          </div>
        </div>
      </details>

      <button className="btn btn--primary btn--full" onClick={save} disabled={saving}>
        {saving ? 'guardando…' : `guardar mente de ${dateLabel}`}
      </button>
    </div>
  );
}

function BookPicker({
  books,
  activeBook,
  onSelect,
}: {
  books: ReadingBook[];
  activeBook: ReadingBook;
  onSelect: (book: ReadingBook) => void;
}) {
  return (
    <div className="book-picker">
      <div className="book-picker-trigger">
        <BookThumb src={bookCoverSrc(activeBook)} title={activeBook.title} size="md" />
        <span>
          <small>livro selecionado</small>
          <strong>{activeBook.title}</strong>
          <em>{activeBook.author}</em>
        </span>
      </div>

      <label className="compact-field">
        <span>escolha o livro de hoje</span>
        <select
          value={activeBook.id}
          onChange={(event) => {
            const selected = books.find((book) => book.id === event.target.value);
            if (selected) onSelect(selected);
          }}
        >
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title} - {book.author}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function QuickChoices({
  label,
  options,
  value,
  suffix = '',
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  suffix?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="quick-choice">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={value === option ? 'quick-choice--active' : ''}
            onClick={() => onChange(option)}
          >
            {option}{suffix}
          </button>
        ))}
      </div>
    </div>
  );
}

function buildPracticeSuggestions(dateIso: string, musicPrefs: string[]): Record<MindType, PracticeSuggestion> {
  const day = new Date(`${dateIso}T12:00:00`).getDay();
  const focusMethods = [
    {
      title: 'Pomodoro 25/5',
      action: 'Escolha uma tarefa concreta, rode 25 minutos sem troca de aba e feche com 5 minutos de pausa real.',
    },
    {
      title: 'Flowtime gentil',
      action: 'Escolha uma tarefa concreta e ligue um cronômetro crescente. Trabalhe até perceber queda de clareza, inquietação ou vontade forte de trocar de aba. Pare, anote quantos minutos focou e faça uma pausa proporcional: 5 min se focou até 25 min, 8 min se focou até 50 min, 10 a 15 min se passou de 50 min.',
    },
    {
      title: 'Bloco 50/10',
      action: 'Use 50 minutos para tarefa profunda e 10 minutos longe da tela. Bom para trabalho que exige continuidade.',
    },
  ];
  const focus = focusMethods[day % focusMethods.length];
  const soundQuery = buildSpotifyQuery(musicPrefs, day);
  const pausePhrases = [
    'Eu posso voltar para o próximo passo, não para o dia inteiro.',
    'A pressa não precisa dirigir a minha atenção.',
    'Uma coisa por vez ainda é movimento.',
    'Eu não preciso obedecer toda urgência que aparece.',
    'Meu corpo também participa da decisão.',
    'Clareza antes de velocidade.',
    'O suficiente feito com presença conta.',
  ];

  return {
    foco: {
      title: focus.title,
      detail: 'metodologia sugerida para o bloco de foco',
      action: focus.action,
    },
    leitura: {
      title: 'Leitura atual',
      detail: 'livro atual vindo da sua Biblioteca',
      action: 'Leia uma unidade pequena: 1 capítulo curto ou 6 a 10 páginas. O avanço fica registrado para insight.',
    },
    som: {
      title: 'Deep focus instrumental',
      detail: 'link do Spotify por humor e contexto',
      action: 'Use som sem letra se precisar foco; se o corpo estiver cansado, escolha ambient mais lento.',
      link: `https://open.spotify.com/search/${encodeURIComponent(soundQuery)}`,
      linkLabel: 'buscar no Spotify',
    },
    meditacao: {
      title: 'Silêncio guiado de 10 a 15 min',
      detail: 'Headspace ou silêncio com timer',
      action: 'Sente com coluna confortável, respire natural e volte para o som ambiente quando a mente puxar assunto.',
      link: 'https://www.headspace.com/meditation/10-minute-meditation',
      linkLabel: 'abrir no Headspace',
    },
    pausa: {
      title: pausePhrases[day],
      detail: 'frase de repetição do dia',
      action: 'Repita três vezes antes de responder mensagens, trocar de tarefa ou acelerar por ansiedade.',
    },
  };
}

function buildResourceSuggestions(day: number, prefs: ContentPref[]): ResourceSuggestion[] {
  const model = MENTAL_MODELS[day % MENTAL_MODELS.length];
  const breathing = BREATHING[day % BREATHING.length];
  const pref = prefs[day % Math.max(1, prefs.length)] ?? 'neurociencia';
  const topics = LEARNING_BY_PREF[pref] ?? LEARNING_BY_PREF.neurociencia;
  const topic = topics[day % topics.length];

  return [
    {
      id: 'mental-model',
      title: 'Modelo mental em 5 minutos',
      subtitle: model[0],
      detail: 'Um link diferente para usar como lente do dia.',
      link: model[1],
      linkLabel: 'abrir modelo',
    },
    {
      id: 'tiny-habit',
      title: 'Hábito pequeno',
      subtitle: HABITS[day % HABITS.length],
      detail: 'A sugestão de hoje deve ser pequena o bastante para caber num dia ruim.',
      link: 'https://jamesclear.com/atomic-habits-summary',
      linkLabel: 'base do hábito',
    },
    {
      id: 'breathing',
      title: 'Respiração',
      subtitle: breathing[0],
      detail: 'Use quando a cabeça estiver veloz demais para decidir bem.',
      link: breathing[1],
      linkLabel: 'abrir guia',
    },
    {
      id: 'learn',
      title: 'Aprender algo novo hoje',
      subtitle: topic,
      detail: `Assunto alinhado à preferência: ${contentPrefLabel(pref)}.`,
      link: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${topic} explained`)}`,
      linkLabel: 'buscar aula',
    },
  ];
}

function localSuggestionItems(
  suggestions: Record<MindType, PracticeSuggestion>,
  resources: ResourceSuggestion[],
): MindSuggestionItem[] {
  return [
    {
      kind: 'foco',
      short: 'F',
      label: 'Foco',
      value: suggestions.foco.title,
      instruction: suggestions.foco.detail,
      practice: 'foco',
    },
    {
      kind: 'som',
      short: 'S',
      label: 'Som',
      value: suggestions.som.title,
      instruction: suggestions.som.detail,
      href: suggestions.som.link,
    },
    {
      kind: 'pausa',
      short: 'P',
      label: 'Pausa',
      value: suggestions.pausa.title,
      instruction: suggestions.pausa.detail,
      practice: 'pausa',
    },
    {
      kind: 'repertorio',
      short: 'R',
      label: 'Repertório',
      value: resources[0]?.subtitle ?? 'um modelo mental curto',
      instruction: resources[0]?.detail,
      href: resources[0]?.link,
    },
  ];
}

function parseAiSuggestions(
  note: string,
  suggestions: Record<MindType, PracticeSuggestion>,
  resources: ResourceSuggestion[],
): MindSuggestionItem[] {
  const fallback = note.trim();
  const lines = note
    .split(/\n|(?=\b(?:Foco|Som|Pausa|Repertório):)/i)
    .map((line) => line.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean);
  const parsed = lines.map((line) => {
    const [rawLabel, ...rest] = line.split(':');
    const label = rawLabel?.trim() || 'Sugestão';
    const rawValue = rest.join(':').trim() || fallback;
    const [value, parsedInstruction] = splitSuggestionLine(rawValue);
    const normalized = label.toLowerCase();
    const kind = normalized.includes('som')
      ? 'som'
      : normalized.includes('pausa')
        ? 'pausa'
        : normalized.includes('repert')
          ? 'repertorio'
          : 'foco';
    const href = kind === 'som' ? suggestions.som.link : kind === 'repertorio' ? resources[0]?.link : undefined;
    const practice: MindType | undefined = kind === 'foco' ? 'foco' : kind === 'pausa' ? 'pausa' : undefined;

    return {
      kind,
      short: label.charAt(0).toUpperCase(),
      label,
      value,
      instruction: parsedInstruction || defaultSuggestionPhrase(kind, suggestions, resources),
      href,
      practice,
    };
  });

  return parsed.length
    ? parsed.slice(0, 4)
    : [{ kind: 'foco', short: 'S', label: 'Sugestão', value: fallback, practice: 'foco' }];
}

function splitSuggestionLine(text: string): [string, string] {
  const clean = text.replace(/^[-–—]\s*/, '').trim();
  const [title, ...rest] = clean.split(/\s[-–—]\s/);
  if (rest.length) return [title.trim(), firstSentence(rest.join(' - '))];

  return [firstSentence(clean), ''];
}

function firstSentence(text: string): string {
  const match = text.trim().match(/^(.+?[.!?])(?:\s|$)/);
  return (match?.[1] ?? text.trim()).slice(0, 120);
}

function defaultSuggestionPhrase(
  kind: string,
  suggestions: Record<MindType, PracticeSuggestion>,
  resources: ResourceSuggestion[],
): string {
  if (kind === 'som') return suggestions.som.detail;
  if (kind === 'pausa') return suggestions.pausa.detail;
  if (kind === 'repertorio') return resources[0]?.detail ?? 'Uma lente simples para o dia.';
  return suggestions.foco.detail;
}

function defaultPracticeLog(type: MindType): PracticeLog {
  const duration: Record<MindType, string> = {
    foco: '25',
    leitura: '15',
    som: '20',
    meditacao: '10',
    pausa: '3',
  };
  return { duration: duration[type], feeling: 'clara', notes: '' };
}

function contentRefFor(
  type: MindType,
  mind: MindState,
  suggestion: PracticeSuggestion,
  activeBook: ReadingBook | null,
) {
  if (type === 'leitura') {
    if (activeBook) {
      const pagesRead = Number(mind.pagesRead || mind.currentPage) || 0;
      return [
        `${activeBook.title} - ${activeBook.author}`,
        pagesRead ? `${pagesRead} páginas hoje` : `p.${activeBook.current_page}`,
      ].filter(Boolean).join(' ');
    }

    return [
      mind.bookTitle || 'livro não conectado',
      mind.currentPage ? `p.${mind.currentPage}` : '',
      mind.totalPages ? `de ${mind.totalPages}` : '',
    ].filter(Boolean).join(' ');
  }
  return suggestion.link ?? suggestion.title;
}

function practiceLabel(type: MindType) {
  return PRACTICES.find((practice) => practice.value === type)?.label ?? type;
}

function buildSpotifyQuery(musicPrefs: string[], day: number) {
  if (musicPrefs.includes('classical')) return 'classical focus deep work';
  if (musicPrefs.includes('jazz')) return 'jazz focus instrumental';
  if (musicPrefs.includes('electronic')) return 'ambient electronic focus';
  if (musicPrefs.includes('brazilian')) return 'instrumental brazilian calm focus';
  if (musicPrefs.includes('silence')) return 'brown noise focus';

  return ['ambient focus', 'deep focus instrumental', 'brown noise sleep', 'calm piano focus'][day % 4];
}

function contentPrefLabel(pref: ContentPref) {
  const labels: Record<ContentPref, string> = {
    longevidade: 'longevidade',
    neurociencia: 'neurociência',
    filosofia: 'filosofia',
    performance: 'performance',
    literatura: 'literatura',
    ciencia: 'ciência',
    negocios: 'negócios',
    arte: 'arte',
  };
  return labels[pref];
}
