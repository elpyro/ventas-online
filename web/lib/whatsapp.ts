/**
 * Enlaces de WhatsApp (wa.me).
 *
 * El número guardado en store_config suele ser nacional colombiano (10 dígitos,
 * sin código de país); wa.me exige formato internacional completo, así que aquí
 * se normaliza una sola vez para toda la web.
 */

export const COLOMBIA_COUNTRY_CODE = "57";

/** Solo dígitos, con código de país 57 si viene en formato nacional (10 dígitos). */
export function waDigits(phone: string): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  // 10 dígitos: nacional colombiano (ej. 3125866072) → anteponer 57.
  if (d.length === 10) return `${COLOMBIA_COUNTRY_CODE}${d}`;
  // 12 dígitos empezando en 57: ya está en internacional, no duplicar.
  if (d.length === 12 && d.startsWith(COLOMBIA_COUNTRY_CODE)) return d;
  return d;
}

/** URL wa.me lista para usar; devuelve undefined si el número no es válido. */
export function waLink(phone: string, text?: string): string | undefined {
  const d = waDigits(phone);
  if (d.length < 10) return undefined;
  const suffix = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${d}${suffix}`;
}
