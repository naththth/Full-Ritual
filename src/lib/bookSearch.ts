import { coverUrlForIsbn } from './reading';

export interface BookSuggestion {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  isbn13: string | null;
  pages: number | null;
  publisher: string | null;
  coverUrl: string | null;
}

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  isbn?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  publisher?: string[];
}

interface OpenLibraryResponse {
  docs?: OpenLibraryDoc[];
}

export async function searchBookSuggestions(
  title: string,
  author: string,
  signal?: AbortSignal,
): Promise<BookSuggestion[]> {
  const cleanTitle = title.trim();
  const cleanAuthor = author.trim();
  const query = [cleanTitle, cleanAuthor].filter(Boolean).join(' ');
  if (query.length < 3) return [];

  const params = new URLSearchParams({
    fields: 'key,title,author_name,isbn,cover_i,number_of_pages_median,publisher',
    limit: '7',
  });

  if (cleanTitle) params.set('title', cleanTitle);
  if (cleanAuthor) params.set('author', cleanAuthor);
  if (!cleanTitle || !cleanAuthor) params.set('q', query);

  const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`, { signal });
  if (!response.ok) throw new Error('Open Library search failed');
  const data = await response.json() as OpenLibraryResponse;

  const seen = new Set<string>();
  return (data.docs ?? [])
    .map(mapOpenLibraryDoc)
    .filter((book): book is BookSuggestion => {
      if (!book) return false;
      const key = `${book.title}:${book.author}:${book.isbn13 ?? book.isbn ?? ''}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function mapOpenLibraryDoc(doc: OpenLibraryDoc): BookSuggestion | null {
  if (!doc.title) return null;

  const isbn13 = doc.isbn?.find((value) => normalizeIsbn(value).length === 13) ?? null;
  const isbn = isbn13 ?? doc.isbn?.find(Boolean) ?? null;
  const normalizedIsbn = isbn ? normalizeIsbn(isbn) : null;
  const coverUrl = doc.cover_i
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg`
    : coverUrlForIsbn(normalizedIsbn, 'S');

  return {
    id: doc.key ?? `${doc.title}-${doc.author_name?.[0] ?? 'unknown'}`,
    title: doc.title,
    author: doc.author_name?.[0] ?? 'autor não informado',
    isbn: normalizedIsbn,
    isbn13: isbn13 ? normalizeIsbn(isbn13) : null,
    pages: Number.isFinite(doc.number_of_pages_median) ? doc.number_of_pages_median ?? null : null,
    publisher: doc.publisher?.[0] ?? null,
    coverUrl,
  };
}

function normalizeIsbn(value: string) {
  return value.replace(/[="]/g, '').replace(/[^0-9X]/gi, '');
}
