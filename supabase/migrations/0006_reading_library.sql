-- Feature: biblioteca pessoal e progresso de leitura.

create table if not exists public.reading_books (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'manual' check (source in ('goodreads','manual','import')),
  external_id text,
  title text not null,
  author text not null,
  isbn text,
  isbn13 text,
  publisher text,
  pages int check (pages is null or pages >= 0),
  current_page int not null default 0 check (current_page >= 0),
  status text not null default 'want_to_read'
    check (status in ('reading','want_to_read','read','paused','abandoned')),
  rating numeric check (rating is null or (rating >= 0 and rating <= 5)),
  date_read date,
  date_added date,
  shelves text[] not null default '{}',
  review text,
  notes text,
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists reading_books_user_status
  on public.reading_books(user_id, status, updated_at desc);

create index if not exists reading_books_user_title
  on public.reading_books(user_id, title);

drop trigger if exists reading_books_updated on public.reading_books;
create trigger reading_books_updated before update on public.reading_books
  for each row execute function public.set_updated_at();

create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null,
  date date not null default current_date,
  start_page int check (start_page is null or start_page >= 0),
  end_page int check (end_page is null or end_page >= 0),
  pages_read int check (pages_read is null or pages_read >= 0),
  minutes int check (minutes is null or minutes >= 0),
  feeling text,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (user_id, book_id) references public.reading_books(user_id, id) on delete cascade
);

create index if not exists reading_sessions_user_date
  on public.reading_sessions(user_id, date desc);

alter table public.reading_books enable row level security;
alter table public.reading_sessions enable row level security;

drop policy if exists "own reading books select" on public.reading_books;
drop policy if exists "own reading books insert" on public.reading_books;
drop policy if exists "own reading books update" on public.reading_books;
drop policy if exists "own reading books delete" on public.reading_books;

create policy "own reading books select" on public.reading_books
  for select using (auth.uid() = user_id);
create policy "own reading books insert" on public.reading_books
  for insert with check (auth.uid() = user_id);
create policy "own reading books update" on public.reading_books
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reading books delete" on public.reading_books
  for delete using (auth.uid() = user_id);

drop policy if exists "own reading sessions select" on public.reading_sessions;
drop policy if exists "own reading sessions insert" on public.reading_sessions;
drop policy if exists "own reading sessions update" on public.reading_sessions;
drop policy if exists "own reading sessions delete" on public.reading_sessions;

create policy "own reading sessions select" on public.reading_sessions
  for select using (auth.uid() = user_id);
create policy "own reading sessions insert" on public.reading_sessions
  for insert with check (auth.uid() = user_id);
create policy "own reading sessions update" on public.reading_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reading sessions delete" on public.reading_sessions
  for delete using (auth.uid() = user_id);
