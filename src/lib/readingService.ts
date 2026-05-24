import { supabase } from './supabase';
import { mergeReadingBooks } from './reading';
import type { ReadingBook, ReadingSession } from '../types';

export async function loadReadingBooks(userId: string): Promise<ReadingBook[]> {
  const { data, error } = await supabase
    .from('reading_books')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as ReadingBook[];
}

export async function saveReadingBook(userId: string, book: ReadingBook): Promise<void> {
  const { error } = await supabase
    .from('reading_books')
    .upsert({ ...book, user_id: userId }, { onConflict: 'user_id,id' });
  if (error) throw error;
}

export async function saveReadingSession(userId: string, session: ReadingSession): Promise<void> {
  const { error } = await supabase
    .from('reading_sessions')
    .insert({ ...session, user_id: userId });
  if (error) throw error;
}

export async function listReadingSessions(userId: string, bookId?: string): Promise<ReadingSession[]> {
  let query = supabase
    .from('reading_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (bookId) query = query.eq('book_id', bookId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ReadingSession[];
}

export async function mergeAndSaveBooks(
  userId: string,
  current: ReadingBook[],
  incoming: ReadingBook[],
): Promise<ReadingBook[]> {
  const merged = mergeReadingBooks(current, incoming);
  for (const book of incoming) {
    await saveReadingBook(userId, book);
  }
  return merged;
}
