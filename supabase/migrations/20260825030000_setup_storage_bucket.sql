-- Supabase Storage — бакет для завантажених файлів: фото акаунта
-- (AccountMenu.js) і матеріали задачі (MaterialsBlock.js,
-- «Зображення» / «Файл»). Один спільний бакет user-uploads —
-- шлях кожного файлу починається з user_id (перша частина шляху),
-- саме за нею RLS-політики нижче відрізняють «своє» від «чужого».
--
-- Бакет публічний на читання (public: true) — інакше фото профілю
-- чи матеріал не відкрився б прямим посиланням (<img src>) без
-- Supabase-сесії в кожному запиті. Запис (upload/update/delete) —
-- лише свій user_id, як і скрізь у проєкті.
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`).

insert into storage.buckets (id, name, public)
values ('user-uploads', 'user-uploads', true)
on conflict (id) do nothing;

create policy "Users can view their own uploads"
  on storage.objects for select
  using (bucket_id = 'user-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload their own files"
  on storage.objects for insert
  with check (bucket_id = 'user-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can update their own uploads"
  on storage.objects for update
  using (bucket_id = 'user-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own uploads"
  on storage.objects for delete
  using (bucket_id = 'user-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
