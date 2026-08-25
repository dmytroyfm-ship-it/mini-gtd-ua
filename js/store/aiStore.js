// Клієнт для AI-фіч (js/components/TaskCard.js, js/pages/inbox.js) —
// проксі-виклик через Supabase Edge Function ai-assist/, яка й
// звертається до Groq (ключ лишається на сервері, у застосунку його
// немає). supabase.functions.invoke() сам додає Bearer-токен
// поточної сесії — окремої авторизації тут не треба.
//
// Функція завжди відповідає HTTP 200 з {error: "..."} на будь-яку
// невдачу (щоб не розбиратись із FunctionsHttpError від supabase-js)
// — тут лишається лише перевірити data.error.

import { supabase } from "../lib/supabaseClient.js";

// Повертає масив рядків-кроків.
export async function breakdownTaskWithAI(title) {
  const { data, error } = await supabase.functions.invoke("ai-assist", {
    body: { type: "breakdown", title },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.steps;
}

// tasks: [{ id, title }]. Повертає { taskId, reason }.
export async function suggestNextTaskWithAI(tasks) {
  const { data, error } = await supabase.functions.invoke("ai-assist", {
    body: { type: "next-task", tasks },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { taskId: data.taskId, reason: data.reason };
}
