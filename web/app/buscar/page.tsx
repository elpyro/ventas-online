import type { Metadata } from "next";
import { getAllProducts, getCatalogs } from "@/lib/serverData";
import { matchesProduct } from "@/lib/search";
import { ProductCard } from "@/components/product-card";
import Link from "next/link";
import { SearchX } from "lucide-react";

export const metadata: Metadata = {
  title: "Buscar",
  description: "Resultados de búsqueda de productos.",
  alternates: { canonical: "/buscar" },
  robots: { index: false, follow: true },
};

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const [catalogs, products] = await Promise.all([
    getCatalogs(),
    getAllProducts(),
  ]);
  const catalogTitles = new Map<string, string>(
    (catalogs ?? []).map((c: any) => [String(c.id ?? ""), String(c.title ?? c.id)])
  );

  const results = query
    ? (products ?? [])
        .filter((p: any) => matchesProduct(p, query))
        .sort((a: any, b: any) => (b.stock ?? 0) - (a.stock ?? 0))
    : [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold">
        {query ? `Resultados para “${query}”` : "Buscar"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {results.length}{" "}
        {results.length === 1 ? "resultado" : "resultados"}
        {query ? " en todos los catálogos" : ""}
      </p>

      {query && results.length === 0 && (
        <div className="mt-10 flex flex-col items-center gap-4 rounded-2xl border bg-white p-12 text-center text-muted-foreground">
          <SearchX className="h-10 w-10" />
          <div>
            <p className="font-medium text-foreground">
              No encontramos nada para “{query}”.
            </p>
            <p className="mt-1 text-sm">
              Revisa la ortografía o busca con palabras más generales.
            </p>
          </div>
          <Link href="/catalogos" className="font-medium text-primary hover:underline">
            Ver todos los catálogos →
          </Link>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {results.map((product: any) => (
          <ProductCard
            key={product.sku}
            product={product}
            showCatalog={
              catalogTitles.get(product.catalogIds?.[0]) ?? undefined
            }
          />
        ))}
      </div>
    </main>
  );
}
