-- Замінює тип матеріалу "notion" на "onedrive" (js/components/
-- MaterialsBlock.js) — Notion користувачу не потрібен.
--
-- UPDATE перед ALTER — про всяк випадок, якщо раптом уже є рядки
-- з type = 'notion' (мали б не бути, але інакше ALTER із новим
-- CHECK впав би на існуючих даних).
--
-- Це лише SQL-міграція — виконати самостійно в Supabase SQL Editor
-- (або `supabase db push`).

update public.materials set type = 'onedrive' where type = 'notion';

alter table public.materials drop constraint if exists materials_type_check;
alter table public.materials add constraint materials_type_check
  check (type in ('link', 'file', 'onedrive', 'gdrive'));

comment on column public.materials.type is 'link / file / onedrive / gdrive';
