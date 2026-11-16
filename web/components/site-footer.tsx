"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store, Phone, MapPin, LayoutGrid, Music2 } from "lucide-react";
import { waDigits, waLink } from "@/lib/whatsapp";

export interface FooterCatalog {
  id: string;
  title: string;
}

/**
 * Pie de página. Muestra los catálogos que NO se están viendo ahora:
 * si el visitante está en `/catalogo/hogar`, aquí aparecen los demás.
 */
export function SiteFooter({
  companyName,
  city,
  phoneContact,
  phoneContact2 = "",
  seoDescription = "",
  catalogs,
  logoUrl,
  privacyPolicyUrl,
  gpsLat,
  gpsLng,
  instagram = "",
  facebook = "",
  tiktok = "",
}: {
  companyName: string;
  city: string;
  phoneContact: string;
  phoneContact2?: string;
  seoDescription?: string;
  catalogs: FooterCatalog[];
  logoUrl?: string;
  privacyPolicyUrl?: string;
  gpsLat?: number;
  gpsLng?: number;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
}) {
  const pathname = usePathname() ?? "";

  // Si la ruta es /catalogo/<id>, se oculta ese catálogo del pie.
  const currentCatalogId = pathname.match(/^\/catalogo\/([^/]+)/)?.[1];
  const otherCatalogs = catalogs.filter((c) => c.id !== currentCatalogId);

  return (
    <footer className="mt-12 border-t bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <p className="flex items-center gap-2 text-lg font-bold text-white">
              {logoUrl ? (
                <img src={logoUrl} alt={companyName} className="h-8 w-8 rounded object-contain" />
              ) : (
                <Store className="h-5 w-5 text-blue-400" />
              )}
              {companyName}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {seoDescription || `${companyName} en ${city}.`}
            </p>
            {privacyPolicyUrl && (
              <a
                href={privacyPolicyUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block text-xs font-medium text-slate-300 transition-colors hover:text-white"
              >
                Política de privacidad
              </a>
            )}
            {typeof gpsLat === "number" && typeof gpsLng === "number" && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${gpsLat},${gpsLng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-slate-300 transition-colors hover:text-white"
              >
                <MapPin className="h-4 w-4" /> Ver ubicación
              </a>
            )}
          </div>

          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              <LayoutGrid className="h-4 w-4" />
              {currentCatalogId ? "Otros catálogos" : "Catálogos"}
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {otherCatalogs.map((catalog) => (
                <li key={catalog.id}>
                  <Link
                    href={`/catalogo/${catalog.id}`}
                    className="inline-flex rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all duration-150 hover:border-blue-400 hover:text-white"
                  >
                    {catalog.title}
                  </Link>
                </li>
              ))}
              {otherCatalogs.length === 0 && (
                <li className="text-sm text-slate-500">No hay más catálogos.</li>
              )}
            </ul>
          </div>

          <div className="text-sm text-slate-400">
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> {city}, Colombia
            </p>
            <p className="mt-1 pl-6 text-xs text-slate-500">
              Despachos a todo el país
            </p>
            {phoneContact && (
              <p className="mt-2 flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <a
                  href={waLink(phoneContact) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-white"
                >
                  +{waDigits(phoneContact)}
                </a>
              </p>
            )}
            {phoneContact2 && (
              <p className="mt-2 flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <a
                  href={waLink(phoneContact2) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-white"
                >
                  +{waDigits(phoneContact2)}
                </a>
              </p>
            )}
            <p className="mt-4 text-xs text-slate-500">
              Atención y confirmación de pedidos por WhatsApp.
            </p>
          </div>

          <div className="text-sm text-slate-400">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Redes sociales
            </p>
            <div className="mt-3 flex gap-3">
              {instagram && (
                <a
                  href={instagram}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Instagram"
                  title="Instagram"
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 transition-all duration-150 hover:border-pink-400 hover:text-pink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
                >
                  <span className="text-lg font-extrabold">ig</span>
                </a>
              )}
              {facebook && (
                <a
                  href={facebook}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                  title="Facebook"
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 transition-all duration-150 hover:border-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <span className="text-lg font-extrabold lowercase">f</span>
                </a>
              )}
              {tiktok && (
                <a
                  href={tiktok}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="TikTok"
                  title="TikTok"
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 transition-all duration-150 hover:border-cyan-300 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <Music2 className="h-5 w-5" />
                </a>
              )}
            </div>
            {!instagram && !facebook && !tiktok && (
              <p className="mt-2 text-xs text-slate-500">Redes sociales próximas.</p>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-slate-800 pt-6 text-xs text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} {companyName}. Todos los derechos reservados.</p>
          <nav className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href="/privacidad"
              className="rounded-full border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition-colors hover:border-slate-400 hover:text-white"
            >
              Política de privacidad
            </Link>
            <Link href="/catalogos" className="px-2 transition-colors hover:text-white">
              Catálogos
            </Link>
            <Link href="/carrito" className="px-2 transition-colors hover:text-white">
              Carrito
            </Link>
            <Link href="/login" className="px-2 transition-colors hover:text-white">
              Ingresar
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
