// Дати за київським часом — спільне для daily-reminder/ (ранковий
// дайджест) і telegram-webhook/ (команда /report у боті): сервер
// завжди в UTC, а і нагадування, і звіт — для користувача в Україні.
// Усюди працюємо з датами як рядками "YYYY-MM-DD" (не Date-обʼєктами
// напряму) — вони й порівнюються лексикографічно правильно, і не
// плутають з часовим поясом сервера.

export function todayInKyiv(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date());
}

// timestamptz (напр. tasks.completed_at) → дата за київським часом.
export function kyivDateOf(isoString: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date(isoString));
}

export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Понеділок тижня, що містить dateStr (getUTCDay(): 0=нд..6=сб).
export function mondayOf(dateStr: string): string {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(dateStr, diff);
}

// Перший і останній день місяця, що містить dateStr.
export function monthRange(dateStr: string): { from: string; to: string } {
  const [year, month] = dateStr.split("-").map(Number);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}
