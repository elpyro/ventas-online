import { getStoreConfig, getCatalogs } from "@/lib/serverData";
import { getPalette } from "@/lib/palette";
import type { Metadata } from "next";
import Link from "next/link";
import { HomeSearch } from "@/components/home-search";
import { BannerCarousel } from "@/components/banner-carousel";
import { HeroBadges } from "@/components/hero-badges";

type Faq = { q: string; a: string };

/** Normaliza las FAQ guardadas desde el APK; ignora filas incompletas. */
function normalizeFaqs(raw: unknown): Faq[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return { q: "", a: "" };
      const m = item as Record<string, unknown>;
      return {
        q: String(m.question ?? m.q ?? "").trim(),
        a: String(m.answer ?? m.a ?? "").trim(),
      };
    })
    .filter((f) => f.q.length > 0 && f.a.length > 0);
}

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStoreConfig();
  const companyName = String(config?.companyName ?? "Ventas Online");
  const city = String(config?.city ?? "");
  const title = String(
    config?.metaTitle ?? (city ? `${companyName} en ${city}` : companyName)
  );
  const description = String(
    config?.metaDescription ?? (city ? `${companyName} en ${city}` : companyName)
  );
  return {
    title,
    description,
    alternates: { canonical: "/" },
  };
}

export default async function Home() {
  const [config, catalogs] = await Promise.all([getStoreConfig(), getCatalogs()]);
  const palette = getPalette(config);
  const activeCatalogs = (catalogs ?? [])
    .filter((c: any) => c?.isActive !== false && c?.isVisible !== false)
    .sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0));
  const banners = (config?.banners ?? []).filter((b: any) => b.isActive);
  const searchCatalogs = activeCatalogs.map((c: any) => ({
    id: String(c.id),
    title: String(c.title ?? c.id),
  }));

  const siteName = config?.companyName ?? "Ventas Online";
  const city = config?.city ?? "Bogotá";
  const phone = String(config?.phoneContact ?? "").replace(/\D/g, "");
  const url = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const money = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 2,
  });
  const minOrder = money.format(Number(config?.globalMinOrder ?? 0));

  const defaultFaqs: Faq[] = [
    {
      q: "¿Cómo compro?",
      a: "Elige un catálogo, agrega productos al carrito y completa el checkout con nombre, teléfono, correo y dirección. Un asesor coordina el pago y la entrega por WhatsApp.",
    },
    {
      q: "¿Cuál es la compra mínima?",
      a: `La compra mínima global es ${minOrder}. Cada catálogo puede tener su propio mínimo y el checkout te avisa cuánto falta.`,
    },
    {
      q: "¿Hacen envíos a todo el país?",
      a: `Sí. Despachamos desde ${city} a toda Colombia. El costo y el tiempo de entrega se confirman por WhatsApp${phone ? ` al +${phone}` : ""} según la ciudad y el tamaño del pedido.`,
    },
    {
      q: "¿Cómo pago y cómo recibo mi pedido?",
      a: `El pago y la entrega se coordinan por WhatsApp${phone ? ` al +${phone}` : ""}. Atendemos desde ${city} con despachos a todo el país.`,
    },
    {
      q: `¿Dónde contacto a ${siteName}?`,
      a: `Por WhatsApp${phone ? ` al +${phone}` : ""} o desde la web. Ciudad: ${city}, Colombia.`,
    },
  ];

  // Si el admin ya guardó sus FAQ (aunque sea una lista vacía), mandan ellas.
  // Las de ejemplo solo se usan cuando el campo todavía no existe en Firestore.
  const faqs = Array.isArray(config?.faqs)
    ? normalizeFaqs(config.faqs)
    : defaultFaqs;

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: siteName,
        url,
        telephone: phone ? `+${phone}` : undefined,
        address: {
          "@type": "PostalAddress",
          addressLocality: city,
          addressCountry: "CO",
        },
        areaServed: { "@type": "Country", name: "Colombia" },
        sameAs: [config?.instagram, config?.facebook, config?.tiktok].filter(
          (value) => typeof value === "string" && value.length > 0
        ),
      },
      {
        "@type": "WebSite",
        name: siteName,
        url,
        inLanguage: "es-CO",
      },
      {
        "@type": "Store",
        name: siteName,
        telephone: phone ? `+${phone}` : undefined,
        address: {
          "@type": "PostalAddress",
          addressLocality: city,
          addressCountry: "CO",
        },
        areaServed: { "@type": "Country", name: "Colombia" },
        currenciesAccepted: "COP",
        paymentAccepted: "Efectivo, transferencia y pago contra entrega",
      },
    ],
  };

  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      {faqs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqLd).replace(/</g, "\\u003c"),
          }}
        />
      )}
      {/* Encabezado principal */}
      <section
        className="border-b text-white"
        style={{
          background: `linear-gradient(to bottom right, ${palette.primary} 0%, ${palette.primaryDark} 55%, #0F172A 100%)`,
        }}
      >
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
            {/* Buscador: arriba en móvil, a la derecha en desktop */}
            <div className="order-1 w-full md:order-2 md:w-[42%] md:shrink-0">
              <HomeSearch catalogs={searchCatalogs} />
            </div>
            <div className="order-2 flex-1 md:order-1">
              <h1 className="max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">
                {config?.companyName ?? "Ventas Online"}
              </h1>
              <p className="mt-3 max-w-xl text-white/85">
                {String(
                  config?.slogan ??
                    `Catálogo mayorista con entrega en ${config?.city ?? "tu ciudad"}. Compra mínima global: $${Number(config?.globalMinOrder ?? 0).toFixed(2)}.`
                )}
              </p>
              <HeroBadges badges={config?.heroBadges} />
            </div>
          </div>
        </div>
      </section>

      {/* Banners */}
      {banners.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 mt-6">
          <BannerCarousel banners={banners} />
        </section>
      )}

      {/* Catalogs grid */}
      <section className="max-w-6xl mx-auto px-4 mt-8">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold">Nuestros catálogos</h2>
          <Link href="/catalogos" className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700">
            Ver todos →
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3">
          {activeCatalogs.map((c: any) => (
            <Link
              key={c.id}
              href={`/catalogo/${c.id}`}
              className="group overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="relative h-28 sm:h-40 overflow-hidden">
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
                <h3 className="font-semibold text-foreground">{c.title}</h3>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition-colors group-hover:bg-blue-100">
                  Ver
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Preguntas frecuentes */}
      {faqs.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 mt-10 mb-12">
          <h2 className="text-2xl font-semibold">Preguntas frecuentes</h2>
          <dl className="mt-4 space-y-4">
            {faqs.map((f, i) => (
              <div
                key={`${f.q}-${i}`}
                className="rounded-xl border bg-white p-4 shadow-sm"
              >
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </main>
  );
}
