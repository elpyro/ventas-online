import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCatalog, getProductsByCatalog } from "@/lib/serverData";
import CatalogoClient from "./catalogo-client";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const catalog = await getCatalog(id);

  if (!catalog || catalog.isActive === false) {
    return { title: "Catálogo no disponible", robots: { index: false, follow: false } };
  }

  const title = String(catalog.seoTitle || catalog.title || "Catálogo");
  const description = String(
    catalog.seoDescription ||
      `Compra mayorista de ${catalog.title ?? id} en ${
        process.env.NEXT_PUBLIC_STORE_CITY ?? "Bogotá"
      }.`
  );

  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/catalogo/${id}` },
    openGraph: {
      type: "website",
      title,
      description,
      images: catalog.coverImage
        ? [{ url: catalog.coverImage, width: 600, height: 400, alt: catalog.title }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: catalog.coverImage ? [catalog.coverImage] : undefined,
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const catalog = await getCatalog(id);

  if (!catalog || catalog.isActive === false) {
    notFound();
  }

  const products = (await getProductsByCatalog(id)) ?? [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: catalog.title,
    description:
      catalog.seoDescription ??
      `Compra mayorista de ${catalog.title}.`,
    isPartOf: {
      "@type": "WebSite",
      name: process.env.NEXT_PUBLIC_STORE_NAME ?? "Ventas Online",
      url: BASE_URL,
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: BASE_URL },
        { "@type": "ListItem", position: 2, name: catalog.title, item: `${BASE_URL}/catalogo/${id}` },
      ],
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: products.slice(0, 50).map((p: any, index: number) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Product",
          sku: p.sku,
          name: p.name,
          description: p.description ?? p.name,
          image: p.images ?? [],
          brand: { "@type": "Brand", name: catalog.title },
          offers: {
            "@type": "Offer",
            price: Number(p.price ?? 0).toFixed(2),
            priceCurrency: "COP",
            availability:
              p.isAvailable !== false && Number(p.stock ?? 0) > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
          },
        },
      })),
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
      <CatalogoClient id={id} catalogTitle={String(catalog.title ?? id)} />
    </>
  );
}
