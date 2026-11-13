import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { CustomerProvider } from "@/lib/customer";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { WhatsappFloat } from "@/components/whatsapp-float";
import { CartFloat } from "@/components/cart-float";
import { VisitTracker } from "@/components/visit-tracker";
import { Toaster } from "@/components/ui/toaster";
import { getStoreConfig, getCatalogs } from "@/lib/serverData";
import { getPalette, hexToHsl } from "@/lib/palette";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function parseKeywords(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((k) => typeof k === "string" && k);
  if (typeof value === "string") {
    return value.split(",").map((k) => k.trim()).filter(Boolean);
  }
  return [];
}

function firstActiveBanner(config: any): string | undefined {
  const banners = Array.isArray(config?.banners) ? config.banners : [];
  const active = banners.find((b: any) => b?.isActive);
  return typeof active?.imageUrl === "string" ? active.imageUrl : undefined;
}

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStoreConfig();
  const companyName = String(config?.companyName ?? "Ventas Online");
  const city = String(config?.city ?? "Bogotá");
  const title = String(
    config?.metaTitle ?? (city ? `${companyName} en ${city}` : companyName)
  );
  const description = String(
    config?.metaDescription ??
      (city ? `${companyName} en ${city}` : companyName)
  );
  const keywords = parseKeywords(config?.keywords);
  const ogImage =
    (typeof config?.ogImage === "string" && config.ogImage) ||
    firstActiveBanner(config);

  return {
    metadataBase: new URL(BASE_URL),
    title: { default: title, template: `%s | ${companyName}` },
    description,
    keywords,
    openGraph: {
      type: "website",
      locale: "es_CO",
      siteName: companyName,
      title,
      description,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: companyName }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [config, catalogs] = await Promise.all([getStoreConfig(), getCatalogs()]);
  const palette = getPalette(config);
  // Los botones usan `bg-primary` de Tailwind (variable --primary, antes azul
  // fijo). Inyectamos el color primario del tema para que el "Color primario"
  // que se configura en la APK también pinte los botones de la web.
  const primaryHsl = hexToHsl(palette.primary);
  const themeVars = primaryHsl
    ? ({ "--primary": primaryHsl, "--ring": primaryHsl } as CSSProperties)
    : undefined;

  // Catálogo activo (el pie muestra los que no se están viendo).
  const activeCatalogs = (catalogs ?? [])
    .filter((c: any) => c?.isActive !== false)
    .sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0));

  const headerCatalogs = activeCatalogs.map((c: any) => ({
    id: String(c.id),
    title: String(c.title ?? c.id),
    minOrderSubtotal: Number(c.minOrderSubtotal ?? 0),
  }));

  const footerCatalogs = activeCatalogs.map((c: any) => ({
    id: String(c.id),
    title: String(c.title ?? c.id),
  }));

  return (
    <html lang="es">
      <body
        className="min-h-screen text-foreground antialiased"
        style={{ background: palette.background, color: palette.text, ...themeVars }}
      >
        <AuthProvider>
          <CustomerProvider>
            <CartProvider>
              <div className="flex min-h-screen flex-col">
                <SiteHeader
                  companyName={config?.companyName ?? "Ventas Online"}
                  logoUrl={String(config?.logoUrl ?? "")}
                  globalMinOrder={Number(config?.globalMinOrder ?? 0)}
                  catalogs={headerCatalogs}
                />
                <div className="flex-1">{children}</div>
                <CartFloat />
                <WhatsappFloat
                  phones={[
                    String(config?.phoneContact ?? ""),
                    String(config?.phoneContact2 ?? ""),
                  ]}
                />
                <SiteFooter
                  companyName={config?.companyName ?? "Ventas Online"}
                  city={config?.city ?? "Bogotá"}
                  phoneContact={String(config?.phoneContact ?? "").replace(/\D/g, "")}
                  phoneContact2={String(config?.phoneContact2 ?? "").replace(/\D/g, "")}
                  seoDescription={String(config?.metaDescription ?? "")}
                  catalogs={footerCatalogs}
                  logoUrl={String(config?.logoUrl ?? "")}
                  privacyPolicyUrl={String(config?.privacyPolicyUrl ?? "")}
                  gpsLat={typeof config?.gpsLat === "number" ? config.gpsLat : undefined}
                  gpsLng={typeof config?.gpsLng === "number" ? config.gpsLng : undefined}
                  instagram={String(config?.instagram ?? "")}
                  facebook={String(config?.facebook ?? "")}
                  tiktok={String(config?.tiktok ?? "")}
                />
              </div>
              <VisitTracker />
              <Toaster />
            </CartProvider>
          </CustomerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
