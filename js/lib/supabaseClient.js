// Клієнт Supabase — один спільний екземпляр на весь застосунок.
//
// Бібліотеку підключаємо напряму через ESM-CDN (esm.sh), без npm і
// без збірника — узгоджено з рештою стеку (PROJECT_RULES, п.2:
// нових інструментів лише стільки, скільки справді потрібно).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
