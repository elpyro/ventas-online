/**
 * Redes sociales de la tienda. En Config el dueño puede guardar una URL
 * completa o un "@usuario"; aquí se normaliza a URL completa.
 */

export type SocialNetwork = "instagram" | "facebook" | "tiktok";

export const SOCIAL_BASE: Record<SocialNetwork, { label: string; url: string }> = {
  instagram: { label: "Instagram", url: "https://www.instagram.com/" },
  facebook: { label: "Facebook", url: "https://www.facebook.com/" },
  tiktok: { label: "TikTok", url: "https://www.tiktok.com/@" },
};

/** URL completa de la red, o undefined si no hay nada utilizable. */
export function socialLink(network: SocialNetwork, value: unknown): string | undefined {
  const v = String(value ?? "").trim();
  if (!v) return undefined;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "");
  if (!handle) return undefined;
  return `${SOCIAL_BASE[network].url}${handle}`;
}
