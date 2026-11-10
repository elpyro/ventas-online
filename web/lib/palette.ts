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
