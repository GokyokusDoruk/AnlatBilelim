/** Koşullu className birleştirici (clsx'in 5 satırlık hali). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
