/**
 * Búsqueda simple en memoria.
 *
 * Firestore no tiene búsqueda de texto completo, así que normalizamos
 * ambos lados (sin tildes, sin mayúsculas) y exigimos que cada palabra
 * aparezca en algún campo del producto. Suficiente para cientos de
 * productos; para miles, convendría Algolia/Typesense.
 */
export function normalizeSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(query: string): string[] {
  return normalizeSearch(query).split(" ").filter(Boolean);
}

function searchableText(product: {
  name?: unknown;
  sku?: unknown;
  brand?: unknown;
  description?: unknown;
  tags?: unknown;
  catalogIds?: unknown;
}): string {
  const parts: string[] = [
    normalizeSearch(product.name),
    normalizeSearch(product.sku),
    normalizeSearch(product.brand),
    normalizeSearch(product.description),
  ];

  if (Array.isArray(product.tags)) {
    parts.push(normalizeSearch(product.tags.map(String).join(" ")));
  } else {
    parts.push(normalizeSearch(product.tags));
  }

  if (Array.isArray(product.catalogIds)) {
    parts.push(normalizeSearch(product.catalogIds.map(String).join(" ")));
  }

  return parts.filter(Boolean).join(" ");
}

/** Devuelve true si TODAS las palabras del query aparecen en el producto. */
export function matchesProduct(
  product: {
    name?: unknown;
    sku?: unknown;
    brand?: unknown;
    description?: unknown;
    tags?: unknown;
    catalogIds?: unknown;
  },
  query: string
): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  const haystack = searchableText(product);
  return tokens.every((token) => haystack.includes(token));
}
