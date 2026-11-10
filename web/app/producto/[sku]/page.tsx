import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getCatalog,
  getProductsByCatalog,
  getProduct,
} from "@/lib/serverData";
import { ProductCard } from "@/components/product-card";
import ProductDetailClient from "./product-detail-client";
import { productStock } from "@/lib/types";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function resolvePrimaryCatalog(
  catalogIds: unknown,
  preferred?: string
): string | null {
  const ids = Array.isArray(catalogIds)
    ? catalogIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  if (preferred && ids.includes(preferred)) return preferred;
  return ids[0] ?? null;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ catalogo?: string }>;
}): Promise<Metadata> {
  const { sku } = await params;
  const product = await getProduct(sku);
  if (!product) {
    return { title: "Producto no disponible", robots: { index: false, follow: false } };
  }

  const title = String(product.seoTitle || product.name || "Producto");
  const description = String(
    product.seoDescription ||
      product.description ||
      `Compra ${product.name ?? "este producto"} al por mayor.`
  );
  const image = product.images?.[0];

  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/producto/${encodeURIComponent(sku)}` },
    openGraph: {
      type: "website",
      title,
      description,
      images: image ? [{ url: image, width: 1200, height: 900, alt: product.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ catalogo?: string }>;
}) {
  const [{ sku }, sp] = await Promise.all([params, searchParams]);
  const product = await getProduct(sku);

  if (!product) notFound();

  const catalogId = resolvePrimaryCatalog(product.catalogIds, sp?.catalogo);
  const catalog = catalogId ? await getCatalog(catalogId) : null;

  if (catalogId && (!catalog || catalog.isActive === false)) {
    notFound();
  }

  const related = catalogId
    ? ((await getProductsByCatalog(catalogId)) ?? [])
        .filter((p: any) => p?.sku && p.sku !== product.sku)
        .sort((a: any, b: any) => {
          // Disponibles primero; luego por prioridad de stock.
          const aAvailable = productStock(a) > 0 ? 1 : 0;
          const bAvailable = productStock(b) > 0 ? 1 : 0;
          if (aAvailable !== bAvailable) return bAvailable - aAvailable;
          return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
        })
        .slice(0, 4)
    : [];

  const canonicalUrl = `${BASE_URL}/producto/${encodeURIComponent(sku)}`;
  const stock = productStock(product);
  const isAvailable = product.isAvailable !== false && stock > 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    image: Array.isArray(product.images) ? product.images : [],
    description: product.description ?? product.name,
    brand: product.brand
      ? { "@type": "Brand", name: product.brand }
      : undefined,
    category: catalog?.title,
    additionalProperty: Array.isArray(product.specs)
      ? product.specs.map((s: any) => ({
          "@type": "PropertyValue",
          name: String(s?.label ?? ""),
          value: String(s?.value ?? ""),
        }))
      : undefined,
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      price: Number(product.price ?? 0).toFixed(2),
      priceCurrency: "COP",
      itemCondition: "https://schema.org/NewCondition",
      availability: isAvailable
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <ProductDetailClient
        product={product}
        catalogId={catalogId ?? "catalogos"}
        catalogTitle={String(catalog?.title ?? "Catálogo")}
        canonicalUrl={canonicalUrl}
      />

      {/* Productos del mismo catálogo */}
      {related.length > 0 && catalog && (
        <section className="mx-auto max-w-6xl border-t px-4 py-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                También de {catalog.title}
              </p>
              <h2 className="mt-1 text-xl font-bold">Productos relacionados</h2>
            </div>
            <Link
              href={`/catalogo/${encodeURIComponent(catalogId ?? "")}`}
              className="text-sm font-semibold text-primary transition-colors hover:underline"
            >
              Ver todo el catálogo →
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((item: any) => (
              <ProductCard
                key={item.sku}
                product={item}
                catalogId={catalogId ?? undefined}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
