/**
 * Paleta de colores de la tienda (solo web).
 * No aplica a la APK — la APK usa el design system 3D suave.
 * Los valores base pueden sobreescribirse desde `store_config/general`
 * (tema administrable desde la APK > Config > Colores de la web).
 */
export const defaultPalette = {
  // Fondos
  background: "#F0F4F8",
  surface: "#FFFFFF",
  surfaceSoft: "#F8FAFC",

  // Acento primario (esmeralda — también usado en PDFs)
  primary: "#10B981", // emerald-500
  primaryDark: "#047857", // emerald-700
  primarySoft: "#ECFDF5", // emerald-50

  // Secundario / info
  info: "#38BDF8", // sky-400
  infoDark: "#0284C7",

  // Estados
  success: "#34D399",
  warning: "#F59E0B",
  danger: "#EF4444",

  // Texto
  text: "#1E293B", // slate-800
  textMuted: "#64748B", // slate-500
  textFaint: "#94A3B8", // slate-400

  // Bordes
  border: "#E2E8F0", // slate-200
  borderSoft: "#F1F5F9", // slate-100
} as const;

export type Palette = typeof defaultPalette;

/**
 * Convierte `#RGB`/`#RRGGBB` al triplete "H S% L%" que esperan las variables
 * CSS de Tailwind (`hsl(var(--primary))`). Devuelve null si el hex no es válido.
 */
export function hexToHsl(hex: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return `${Math.round(hue)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Mezcla los valores base con el tema guardado en `store_config` (si existe). */
export function getPalette(config?: any): Palette {
  const t = config ?? {};
  const hex = (v: any, fb: string) =>
    typeof v === "string" && /^#[0-9a-fA-F]{3,6}$/.test(v) ? v : fb;
  return {
    ...defaultPalette,
    primary: hex(t.themePrimary, defaultPalette.primary),
    primaryDark: hex(t.themePrimaryDark, defaultPalette.primaryDark),
    primarySoft: hex(t.themePrimarySoft, defaultPalette.primarySoft),
    background: hex(t.themeBackground, defaultPalette.background),
    surface: hex(t.themeSurface, defaultPalette.surface),
    text: hex(t.themeText, defaultPalette.text),
    textMuted: hex(t.themeTextMuted, defaultPalette.textMuted),
  } as Palette;
}

export const palette = defaultPalette;

/** Precio en pesos colombianos — usar en toda la web. */
export const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});

export function formatPrice(value: unknown): string {
  return cop.format(Number(value ?? 0));
}
