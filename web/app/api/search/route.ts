import { getAllProducts } from "@/lib/serverData";
import { matchesProduct } from "@/lib/search";

export const dynamic = "force-dynamic";

/**
 * Búsqueda global simple (en memoria sobre los productos cargados).
 * Devuelve solo lo necesario para la lista desplegable.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q")?.trim() ?? "").slice(0, 80);
  if (q.length < 2) return Response.json({ results: [] });

  const products = (await getAllProducts()) ?? [];
  const results = products
    .filter((p: any) => matchesProduct(p, q))
    .slice(0, 12)
    .map((p: any) => ({
      sku: p.sku,
      name: p.name ?? "",
      price: Number(p.price ?? 0),
      brand: typeof p.brand === "string" ? p.brand : "",
      image: Array.isArray(p.images) ? p.images[0] ?? "" : "",
      stock: Number(p.stock ?? 0),
      hasVariants: Array.isArray(p.variants) && p.variants.length > 0,
      catalogId: Array.isArray(p.catalogIds) ? p.catalogIds[0] : "",
    }));

  // Sin caché de CDN: la respuesta depende de `q` y Netlify no varía su
  // clave de caché con los query params por defecto, así que cachearla
  // servía el último resultado a todas las búsquedas. Los productos ya
  // se cachean 60 s en el servidor (getAllProducts).
  return Response.json(
    { results },
    { headers: { "cache-control": "no-store" } }
  );
}
