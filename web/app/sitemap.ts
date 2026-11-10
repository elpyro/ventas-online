import type { MetadataRoute } from "next";
import { getCatalogs, getAllProducts } from "@/lib/serverData";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalogs = (await getCatalogs()) ?? [];
  const products = (await getAllProducts()) ?? [];

  const visible = catalogs
    .filter((c: any) => c?.isActive !== false && c?.isVisible !== false)
    .sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0));

  const now = new Date();

  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/catalogos`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...visible.map((c: any) => ({
      url: `${BASE_URL}/catalogo/${c.id}`,
      lastModified: c.updatedAt ? new Date(c.updatedAt) : now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...products.slice(0, 500).map((p: any) => ({
      url: `${BASE_URL}/producto/${encodeURIComponent(String(p.sku ?? ""))}`,
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
