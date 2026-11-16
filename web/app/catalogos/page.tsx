import type { Metadata } from "next";
import { getCatalogs } from "@/lib/serverData";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Catálogos al por mayor en Bogotá",
  description:
    "Catálogos mayoristas de CELTOONS en Bogotá: estuchería, tecnología, vidrios, bisutería y más. Compra desde $200.000 con envíos a toda Colombia.",
  alternates: { canonical: "/catalogos" },
};

export default async function CatalogosPage() {
  const catalogs = await getCatalogs();
  // Los ocultos por el administrador no aparecen aquí; se listan en el pie.
  const active = (catalogs ?? [])
    .filter((c: any) => c?.isActive !== false && c?.isVisible !== false)
    .sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0));

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Catálogos mayoristas de CELTOONS",
    description:
      "Listado de catálogos mayoristas de CELTOONS: accesorios de celular, tecnología, vidrios y más, con envíos a toda Colombia desde Bogotá.",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: active.map((c: any, index: number) => ({
        "@type": "ListItem",
        position: index + 1,
        name: c.title,
        url: `${base}/catalogo/${c.id}`,
      })),
    },
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <h1 className="text-2xl font-bold">Catálogos</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Elige un catálogo para ver sus productos.
      </p>

      {active.length === 0 && (
        <p className="mt-6 rounded-xl border bg-white p-6 text-center text-muted-foreground">
          No hay catálogos disponibles por ahora.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
        {active.map((c: any) => (
          <Link
            key={c.id}
            href={`/catalogo/${c.id}`}
            className="group overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="relative h-44 overflow-hidden">
              <img
                src={c.coverImage}
                alt={c.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {c.minOrderSubtotal > 0 && (
                <span className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white">
                  Mín. ${c.minOrderSubtotal}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <h3 className="font-semibold">{c.title}</h3>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition-colors group-hover:bg-blue-100">
                Ver
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
