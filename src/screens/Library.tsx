import { useEffect, useMemo, useState } from 'react';
import { BookThumb } from '../components/BookThumb';
import { type BookSuggestion, searchBookSuggestions } from '../lib/bookSearch';
import { isoToday } from '../lib/dates';
import {
  createManualBook,
  bookCoverSrc,
  mergeReadingBooks,
  parseGoodreadsCsv,
  readingProgress,
  readingStatusLabel,
} from '../lib/reading';
import { useLocalState } from '../lib/useLocalState';
import { hasSupabase, supabase } from '../lib/supabase';
import { scopedStorageKey } from '../lib/storage';
import { useApp } from '../store/useStore';
import type { ReadingBook, ReadingSession, ReadingStatus } from '../types';

interface BookDraft {
  title: string;
  author: string;
  pages: string;
  status: ReadingStatus;
  isbn: string;
  isbn13: string;
  publisher: string;
  coverUrl: string;
  notes: string;
}

interface ProgressDraft {
  pagesRead: string;
  minutes: string;
  feeling: string;
  notes: string;
}

const emptyBook: BookDraft = {
  title: '',
  author: '',
  pages: '',
  status: 'reading',
  isbn: '',
  isbn13: '',
  publisher: '',
  coverUrl: '',
  notes: '',
};

const STATUS_OPTIONS: ReadingStatus[] = ['reading', 'want_to_read', 'read', 'paused', 'abandoned'];
const FEELINGS = ['clara', 'curiosa', 'calma', 'dispersa', 'cansada', 'tocada'];

export function Library() {
  const userId = useApp((s) => s.userId);
  const showToast = useApp((s) => s.showToast);
  const [books, setBooks] = useLocalState<ReadingBook[]>(scopedStorageKey('full-ritual-reading-books', userId), []);
  const [sessions, setSessions] = useLocalState<ReadingSession[]>(scopedStorageKey('full-ritual-reading-sessions', userId), []);
  const [filter, setFilter] = useState<ReadingStatus | 'all'>('reading');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<BookDraft>(emptyBook);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, ProgressDraft>>({});
  const [bookSuggestions, setBookSuggestions] = useState<BookSuggestion[]>([]);
  const [searchingBook, setSearchingBook] = useState(false);
  const [selectedLookup, setSelectedLookup] = useState('');
  const [importing, setImporting] = useState(false);

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
        if (data?.length) setBooks((current) => mergeReadingBooks(current, data as ReadingBook[]));
      });
  }, [setBooks, userId]);

  useEffect(() => {
    const lookupText = `${draft.title} ${draft.author}`.trim();
    if (lookupText.length < 3 || lookupText === selectedLookup) {
      setBookSuggestions([]);
      setSearchingBook(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchingBook(true);
      searchBookSuggestions(draft.title, draft.author, controller.signal)
        .then(setBookSuggestions)
        .catch((error: Error) => {
          if (error.name !== 'AbortError') console.error(error);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchingBook(false);
        });
    }, 420);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draft.title, draft.author, selectedLookup]);

  const counts = useMemo(() => {
    return STATUS_OPTIONS.reduce((acc, status) => {
      acc[status] = books.filter((book) => book.status === status).length;
      return acc;
    }, {} as Record<ReadingStatus, number>);
  }, [books]);

  const filteredBooks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return books.filter((book) => {
      const byStatus = filter === 'all' || book.status === filter;
      const byQuery = !normalized || `${book.title} ${book.author}`.toLowerCase().includes(normalized);
      return byStatus && byQuery;
    });
  }, [books, filter, query]);

  const readingNow = books.filter((book) => book.status === 'reading');
  const pagesReadToday = sessions
    .filter((session) => session.date === isoToday())
    .reduce((sum, session) => sum + (session.pages_read ?? 0), 0);

  const importCsv = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const incoming = parseGoodreadsCsv(text);
      const next = mergeReadingBooks(books, incoming);
      setBooks(next);
      await syncBooks(incoming, userId);
      showToast(`${incoming.length} livros importados.`);
    } catch (error) {
      console.error(error);
      showToast('não consegui importar o CSV.');
    } finally {
      setImporting(false);
    }
  };

  const addBook = async () => {
    if (!draft.title.trim() || !draft.author.trim()) {
      showToast('preencha título e autor.');
      return;
    }

    const book = createManualBook(draft);
    setBooks((current) => mergeReadingBooks(current, [book]));
    await syncBooks([book], userId);
    setDraft(emptyBook);
    setSelectedLookup('');
    showToast('livro adicionado.');
  };

  const selectBookSuggestion = (suggestion: BookSuggestion) => {
    setSelectedLookup(`${suggestion.title} ${suggestion.author}`.trim());
    setDraft((current) => ({
      ...current,
      title: suggestion.title,
      author: suggestion.author,
      pages: suggestion.pages ? String(suggestion.pages) : current.pages,
      isbn: suggestion.isbn13 ?? suggestion.isbn ?? current.isbn,
      isbn13: suggestion.isbn13 ?? '',
      publisher: suggestion.publisher ?? '',
      coverUrl: suggestion.coverUrl ?? '',
    }));
    setBookSuggestions([]);
  };

  const updateBook = async (bookId: string, patch: Partial<ReadingBook>) => {
    const updatedAt = new Date().toISOString();
    let updatedBook: ReadingBook | null = null;
    setBooks((current) =>
      current.map((book) => {
        if (book.id !== bookId) return book;
        updatedBook = { ...book, ...patch, updated_at: updatedAt };
        return updatedBook;
      })
    );
    if (updatedBook) await syncBooks([updatedBook], userId);
  };

  const registerProgress = async (book: ReadingBook) => {
    const draftForBook = progressDrafts[book.id] ?? defaultProgressDraft();
    const pagesRead = Number(draftForBook.pagesRead) || 0;
    if (pagesRead <= 0) {
      showToast('informe quantas páginas leu hoje.');
      return;
    }
    const endPage = book.current_page + pagesRead;
    const safeEndPage = book.pages ? Math.min(endPage, book.pages) : endPage;
    const now = new Date().toISOString();
    const nextStatus = book.pages && safeEndPage >= book.pages ? 'read' : 'reading';
    const session: ReadingSession = {
      id: crypto.randomUUID(),
      user_id: userId ?? undefined,
      book_id: book.id,
      date: isoToday(),
      start_page: book.current_page || null,
      end_page: safeEndPage || null,
      pages_read: Math.max(0, safeEndPage - book.current_page) || null,
      minutes: Number(draftForBook.minutes) || null,
      feeling: draftForBook.feeling,
      notes: draftForBook.notes || null,
      created_at: now,
    };

    setSessions((current) => [session, ...current]);
    await updateBook(book.id, {
      current_page: safeEndPage,
      status: nextStatus,
      date_read: nextStatus === 'read' ? isoToday() : book.date_read,
    });
    await syncSessions([session], userId);
    setProgressDrafts((current) => ({ ...current, [book.id]: defaultProgressDraft() }));
    showToast('leitura registrada.');
  };

  return (
    <div className="screen stack-md library-screen">
      <header className="stack">
        <span className="eyebrow">biblioteca · leitura</span>
        <h1 className="t-display-lg">
          Sua leitura também vira <em className="t-display-italic">ritual.</em>
        </h1>
        <p className="t-body muted">
          Importe o Goodreads, cadastre livros novos e registre páginas para alimentar Mente e Insight.
        </p>
      </header>

      <section className="metric-grid">
        <Metric label="lendo" value={`${readingNow.length}`} />
        <Metric label="lidos" value={`${counts.read ?? 0}`} />
        <Metric label="páginas hoje" value={`${pagesReadToday}`} />
      </section>

      <section className="card stack">
        <span className="eyebrow">importar · goodreads</span>
        <p className="t-body-sm muted">
          Use o CSV exportado pelo Goodreads. O app reconhece status, páginas, rating, resenha e prateleiras.
        </p>
        <label className="file-button file-button--quiet">
          {importing ? 'importando...' : 'importar CSV'}
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importCsv(file);
            }}
          />
        </label>
      </section>

      <section className="card stack">
        <span className="eyebrow">novo livro</span>
        <div className="book-draft-layout">
          <div className="book-draft-head">
            <BookThumb src={draft.coverUrl} title={draft.title || 'Novo livro'} size="lg" />
            <div className="book-draft-fields">
              <input className="field" placeholder="título" value={draft.title} onChange={(event) => {
                setSelectedLookup('');
                setDraft({ ...draft, title: event.target.value });
              }} />
              <input className="field" placeholder="autor" value={draft.author} onChange={(event) => {
                setSelectedLookup('');
                setDraft({ ...draft, author: event.target.value });
              }} />
            </div>
          </div>

          {(searchingBook || bookSuggestions.length > 0) && (
            <div className="book-suggestion-menu">
              {searchingBook && <span className="book-suggestion-empty">buscando livros...</span>}
              {bookSuggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  className="book-suggestion-row"
                  onClick={() => selectBookSuggestion(suggestion)}
                >
                  <BookThumb src={suggestion.coverUrl} title={suggestion.title} size="sm" />
                  <span>
                    <strong>{suggestion.title}</strong>
                    <small>{suggestion.author}</small>
                    <em>{suggestion.isbn13 ?? suggestion.isbn ?? 'ISBN não informado'}</em>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="book-meta-grid">
            <input className="field" inputMode="numeric" placeholder="páginas" value={draft.pages} onChange={(event) => setDraft({ ...draft, pages: event.target.value })} />
            <input className="field" placeholder="ISBN" value={draft.isbn} onChange={(event) => setDraft({ ...draft, isbn: event.target.value })} />
          </div>
        </div>
        <div className="status-grid">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              className={`chip ${draft.status === status ? 'chip--active' : ''}`}
              onClick={() => setDraft({ ...draft, status })}
            >
              {readingStatusLabel(status)}
            </button>
          ))}
        </div>
        <textarea className="field" rows={2} placeholder="notas, por que entrou na sua biblioteca..." value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        <button className="btn btn--primary btn--full" onClick={addBook}>
          adicionar livro
        </button>
      </section>

      <section className="card stack">
        <div className="row-between">
          <span className="eyebrow">livros</span>
          <span className="t-body-sm muted">{filteredBooks.length} itens</span>
        </div>
        <input className="field" placeholder="buscar por título ou autor" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="status-filter-grid">
          <button className={`status-filter status-filter--all ${filter === 'all' ? 'status-filter--active' : ''}`} onClick={() => setFilter('all')}>
            <span>todos</span>
            <strong>{books.length}</strong>
          </button>
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              className={`status-filter status-filter--${statusClass(status)} ${filter === status ? 'status-filter--active' : ''}`}
              onClick={() => setFilter(status)}
            >
              <span>{readingStatusLabel(status)}</span>
              <strong>{counts[status] ?? 0}</strong>
            </button>
          ))}
        </div>

        <div className="book-list">
          {filteredBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              draft={progressDrafts[book.id] ?? defaultProgressDraft()}
              onDraft={(patch) => setProgressDrafts((current) => ({
                ...current,
                [book.id]: { ...defaultProgressDraft(), ...(current[book.id] ?? {}), ...patch },
              }))}
              onProgress={() => registerProgress(book)}
              onStatus={(status) => updateBook(book.id, { status })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function BookCard({
  book,
  draft,
  onDraft,
  onProgress,
  onStatus,
}: {
  book: ReadingBook;
  draft: ProgressDraft;
  onDraft: (patch: Partial<ProgressDraft>) => void;
  onProgress: () => void;
  onStatus: (status: ReadingStatus) => void;
}) {
  const progress = readingProgress(book);

  return (
    <article className="book-card">
      <div className="book-card-head">
        <BookThumb src={bookCoverSrc(book)} title={book.title} size="md" />
        <div className="book-card-main">
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div>
              <span className="eyebrow">{readingStatusLabel(book.status)}</span>
              <h2>{book.title}</h2>
              <p>{book.author}</p>
            </div>
            {book.rating ? <span className="book-rating">{book.rating}/5</span> : null}
          </div>
        </div>
      </div>

      <div className="book-progress">
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className="t-body-sm muted">
        {book.pages ? `página ${book.current_page} de ${book.pages} · ${progress}%` : 'páginas não informadas'}
      </p>

      <div className="chip-row">
        {STATUS_OPTIONS.map((status) => (
          <button key={status} className={`chip ${book.status === status ? 'chip--active' : ''}`} onClick={() => onStatus(status)}>
            {readingStatusLabel(status)}
          </button>
        ))}
      </div>

      {book.status === 'reading' && (
        <div className="reading-session-box">
          <div className="form-grid">
            <input className="field" inputMode="numeric" placeholder="páginas lidas hoje" value={draft.pagesRead} onChange={(event) => onDraft({ pagesRead: event.target.value })} />
            <input className="field" inputMode="numeric" placeholder="minutos" value={draft.minutes} onChange={(event) => onDraft({ minutes: event.target.value })} />
          </div>
          <div className="chip-row">
            {FEELINGS.map((feeling) => (
              <button key={feeling} className={`chip ${draft.feeling === feeling ? 'chip--active' : ''}`} onClick={() => onDraft({ feeling })}>
                {feeling}
              </button>
            ))}
          </div>
          <textarea className="field" rows={2} placeholder="como foi essa leitura?" value={draft.notes} onChange={(event) => onDraft({ notes: event.target.value })} />
          <button className="btn btn--secondary btn--full" onClick={onProgress}>
            registrar leitura de hoje
          </button>
        </div>
      )}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function statusClass(status: ReadingStatus) {
  const classes: Record<ReadingStatus, string> = {
    reading: 'reading',
    want_to_read: 'want',
    read: 'read',
    paused: 'paused',
    abandoned: 'abandoned',
  };
  return classes[status];
}

function defaultProgressDraft(): ProgressDraft {
  return {
    pagesRead: '',
    minutes: '15',
    feeling: 'curiosa',
    notes: '',
  };
}

async function syncBooks(books: ReadingBook[], userId: string | null) {
  if (!hasSupabase || !userId || !books.length) return;
  const rows = books.map((book) => ({ ...book, user_id: userId }));
  const { error } = await supabase.from('reading_books').upsert(rows, { onConflict: 'user_id,id' });
  if (error) console.error(error);
}

async function syncSessions(sessions: ReadingSession[], userId: string | null) {
  if (!hasSupabase || !userId || !sessions.length) return;
  const rows = sessions.map((session) => ({ ...session, user_id: userId }));
  const { error } = await supabase.from('reading_sessions').insert(rows);
  if (error) console.error(error);
}
