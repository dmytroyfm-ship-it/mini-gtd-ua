// Завантаження файлів у Supabase Storage (бакет user-uploads) —
// спільний хелпер для фото акаунта (authStore.js) і файлів/зображень
// у «Матеріалах» (MaterialsBlock.js).
//
// path обов'язково починається з user_id (перша частина шляху) —
// саме за нею RLS-політики бакета (supabase/migrations/
// 20260825030000_setup_storage_bucket.sql) відрізняють «своє» від
// «чужого»; викликач сам відповідає за це, тут не перевіряється
// повторно.

import { supabase } from "../lib/supabaseClient.js";

const BUCKET = "user-uploads";

export async function uploadFile(path, file) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
