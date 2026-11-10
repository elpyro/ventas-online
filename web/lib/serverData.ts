const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
// Con el emulador activo la home y los catálogos leen el entorno local;
// si no, se consulta la REST de producción (comportamiento habitual).
const EMULATOR =
  process.env.NEXT_PUBLIC_USE_EMULATORS === "true"
    ? `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const BASE = EMULATOR;

function parseValue(v: any): any {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(parseValue);
  if ("mapValue" in v) {
    const out: any = {};
    for (const k of Object.keys(v.mapValue.fields ?? {})) {
      out[k] = parseValue(v.mapValue.fields[k]);
    }
    return out;
  }
  if ("nullValue" in v) return null;
  return null;
}

function parseDoc(doc: any) {
  const id = doc.name.split("/").pop();
  const fields = doc.fields ?? {};
  const out: any = { id };
  for (const k of Object.keys(fields)) {
    out[k] = parseValue(fields[k]);
  }
  return out;
}

export async function getStoreConfig() {
  try {
    const res = await fetch(`${BASE}/store_config/general`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const doc = await res.json();
    return parseDoc(doc);
  } catch {
    return null;
  }
}

export async function getCatalog(id: string) {
  try {
    const res = await fetch(
      `${BASE}/catalogs/${encodeURIComponent(id)}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    const doc = await res.json();
    return parseDoc(doc);
  } catch {
    return null;
  }
}

export async function getCatalogs() {
  try {
    const res = await fetch(`${BASE}/catalogs`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.documents ?? []).map(parseDoc);
  } catch {
    return [];
  }
}

export async function getProductsByCatalog(catalogId: string) {
  try {
    // structured query
    const body = {
      structuredQuery: {
        from: [{ collectionId: "products" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "catalogIds" },
            op: "ARRAY_CONTAINS",
            value: { stringValue: catalogId },
          },
        },
      },
    };
    const res = await fetch(`${BASE}:runQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const arr = await res.json();
    const docs = arr.filter((x: any) => x.document).map((x: any) => parseDoc(x.document));
    // Mismo orden visible que en el cliente: priority asc + nombre.
    return docs.sort((a: any, b: any) => {
      const pa = Number(a.priority ?? 9999);
      const pb = Number(b.priority ?? 9999);
      if (pa !== pb) return pa - pb;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""), "es-CO");
    });
  } catch {
    return [];
  }
}

export async function getProduct(sku: string) {
  try {
    const res = await fetch(
      `${BASE}/products/${encodeURIComponent(sku)}`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return null;
    const doc = await res.json();
    return parseDoc(doc);
  } catch {
    return null;
  }
}

/**
 * Lista todos los productos (para búsqueda y sitemap).
 * El tope evita cargar catálogos gigantes de golpe.
 */
export async function getAllProducts(limit = 500) {
  try {
    const body = {
      structuredQuery: {
        from: [{ collectionId: "products" }],
        limit,
      },
    };
    const res = await fetch(`${BASE}:runQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const arr = await res.json();
    return arr.filter((x: any) => x.document).map((x: any) => parseDoc(x.document));
  } catch {
    return [];
  }
}
