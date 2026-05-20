import type { ReadingBook, ReadingStatus } from '../types';

type CsvRow = Record<string, string>;

const GOODREADS_HEADERS = {
  id: 'Book Id',
  title: 'Title',
  author: 'Author',
  isbn: 'ISBN',
  isbn13: 'ISBN13',
  rating: 'My Rating',
  publisher: 'Publisher',
  pages: 'Number of Pages',
  dateRead: 'Date Read',
  dateAdded: 'Date Added',
  shelves: 'Bookshelves',
  shelf: 'Exclusive Shelf',
  review: 'My Review',
  notes: 'Private Notes',
} as const;

export function parseGoodreadsCsv(csv: string): ReadingBook[] {
  const rows = parseCsv(csv);
  return rows
    .filter((row) => row[GOODREADS_HEADERS.title]?.trim())
    .map(goodreadsRowToBook);
}

export function mergeReadingBooks(current: ReadingBook[], incoming: ReadingBook[]) {
  const byKey = new Map<string, ReadingBook>();

  current.forEach((book) => {
    byKey.set(bookIdentity(book), book);
  });

  incoming.forEach((book) => {
    const key = bookIdentity(book);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeBook(existing, book) : book);
  });

  return [...byKey.values()].sort((a, b) => {
    if (a.status === 'reading' && b.status !== 'reading') return -1;
    if (a.status !== 'reading' && b.status === 'reading') return 1;
    return a.title.localeCompare(b.title, 'pt-BR');
  });
}

export function readingStatusLabel(status: ReadingStatus) {
  const labels: Record<ReadingStatus, string> = {
    reading: 'lendo agora',
    want_to_read: 'quero ler',
    read: 'lidos',
    paused: 'pausados',
    abandoned: 'abandonados',
  };
  return labels[status];
}

export function readingProgress(book: ReadingBook) {
  if (!book.pages || book.pages <= 0) return 0;
  return Math.min(100, Math.round((book.current_page / book.pages) * 100));
}

export function coverUrlForIsbn(isbn: string | null | undefined, size: 'S' | 'M' | 'L' = 'S') {
  return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg` : null;
}

export function bookCoverSrc(book: Pick<ReadingBook, 'cover_url' | 'isbn' | 'isbn13'>, size: 'S' | 'M' | 'L' = 'M') {
  return book.cover_url ?? coverUrlForIsbn(book.isbn13 ?? book.isbn, size);
}

export function createManualBook(input: {
  title: string;
  author: string;
  pages?: string;
  status: ReadingStatus;
  isbn?: string;
  isbn13?: string | null;
  publisher?: string | null;
  coverUrl?: string | null;
  notes?: string;
}): ReadingBook {
  const now = new Date().toISOString();
  const pages = numberOrNull(input.pages ?? '');
  const isbn = normalizeIsbn(input.isbn ?? '');
  const isbn13 = normalizeIsbn(input.isbn13 ?? '') ?? (isbn?.length === 13 ? isbn : null);

  return {
    id: crypto.randomUUID(),
    source: 'manual',
    external_id: null,
    title: input.title.trim(),
    author: input.author.trim(),
    isbn,
    isbn13,
    publisher: input.publisher ?? null,
    pages,
    current_page: input.status === 'read' && pages ? pages : 0,
    status: input.status,
    rating: null,
    date_read: input.status === 'read' ? now.slice(0, 10) : null,
    date_added: now.slice(0, 10),
    shelves: [],
    review: null,
    notes: input.notes?.trim() || null,
    cover_url: input.coverUrl ?? coverUrlForIsbn(isbn13 ?? isbn),
    created_at: now,
    updated_at: now,
  };
}

function goodreadsRowToBook(row: CsvRow): ReadingBook {
  const now = new Date().toISOString();
  const pages = numberOrNull(row[GOODREADS_HEADERS.pages]);
  const status = mapGoodreadsStatus(row[GOODREADS_HEADERS.shelf], row[GOODREADS_HEADERS.shelves]);

  const isbn = normalizeIsbn(row[GOODREADS_HEADERS.isbn]);
  const isbn13 = normalizeIsbn(row[GOODREADS_HEADERS.isbn13]);

  return {
    id: stableBookId(row),
    source: 'goodreads',
    external_id: clean(row[GOODREADS_HEADERS.id]) || null,
    title: clean(row[GOODREADS_HEADERS.title]),
    author: clean(row[GOODREADS_HEADERS.author]),
    isbn,
    isbn13,
    publisher: clean(row[GOODREADS_HEADERS.publisher]) || null,
    pages,
    current_page: status === 'read' && pages ? pages : 0,
    status,
    rating: numberOrNull(row[GOODREADS_HEADERS.rating]),
    date_read: normalizeDate(row[GOODREADS_HEADERS.dateRead]),
    date_added: normalizeDate(row[GOODREADS_HEADERS.dateAdded]),
    shelves: splitShelves(row[GOODREADS_HEADERS.shelves]),
    review: clean(row[GOODREADS_HEADERS.review]) || null,
    notes: clean(row[GOODREADS_HEADERS.notes]) || null,
    cover_url: coverUrlForIsbn(isbn13 ?? isbn),
    created_at: now,
    updated_at: now,
  };
}

function parseCsv(csv: string): CsvRow[] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) records.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.length > 0)) records.push(row);

  const [headers, ...body] = records;
  if (!headers) return [];

  return body.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header, record[index] ?? '']))
  );
}

function stableBookId(row: CsvRow) {
  const externalId = clean(row[GOODREADS_HEADERS.id]);
  if (externalId) return `goodreads-${externalId}`;
  const isbn13 = normalizeIsbn(row[GOODREADS_HEADERS.isbn13]);
  if (isbn13) return `isbn13-${isbn13}`;
  return `book-${slugify(`${row[GOODREADS_HEADERS.title]}-${row[GOODREADS_HEADERS.author]}`)}`;
}

function bookIdentity(book: ReadingBook) {
  return book.external_id
    ? `${book.source}:${book.external_id}`
    : book.isbn13 || book.isbn || `${slugify(book.title)}:${slugify(book.author)}`;
}

function mergeBook(existing: ReadingBook, incoming: ReadingBook): ReadingBook {
  return {
    ...incoming,
    id: existing.id,
    current_page: Math.max(existing.current_page, incoming.current_page),
    status: existing.status === 'reading' ? existing.status : incoming.status,
    notes: existing.notes ?? incoming.notes,
    created_at: existing.created_at,
    updated_at: new Date().toISOString(),
  };
}

function mapGoodreadsStatus(exclusiveShelf = '', shelves = ''): ReadingStatus {
  const value = `${exclusiveShelf} ${shelves}`.toLowerCase();
  if (value.includes('currently-reading')) return 'reading';
  if (value.includes('to-read')) return 'want_to_read';
  if (value.includes('abandoned') || value.includes('dnf')) return 'abandoned';
  if (value.includes('paused')) return 'paused';
  if (value.includes('read')) return 'read';
  return 'want_to_read';
}

function splitShelves(value = '') {
  return value.split(',').map((shelf) => shelf.trim()).filter(Boolean);
}

function normalizeDate(value = '') {
  const cleanValue = clean(value);
  if (!cleanValue) return null;
  const parsed = new Date(cleanValue);
  if (Number.isNaN(parsed.getTime())) return cleanValue;
  return parsed.toISOString().slice(0, 10);
}

function normalizeIsbn(value = '') {
  const normalized = clean(value).replace(/[="]/g, '').replace(/[^0-9X]/gi, '');
  return normalized || null;
}

function numberOrNull(value = '') {
  const parsed = Number(clean(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function clean(value = '') {
  return value.trim().replace(/^="/, '').replace(/"$/, '');
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
