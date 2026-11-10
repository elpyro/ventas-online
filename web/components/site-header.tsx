import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { CartDrawer, type CartDrawerCatalog } from "@/components/cart-drawer";
import { AccountMenu } from "@/components/account-menu";

/**
 * Encabezado global de la tienda: marca, navegación y panel del carrito.
 * Es un Server Component; el panel del carrito es cliente (estado del navegador).
 */
export function SiteHeader({
  companyName,
  logoUrl,
  globalMinOrder,
  catalogs,
}: {
  companyName: string;
  logoUrl?: string;
  globalMinOrder: number;
  catalogs: CartDrawerCatalog[];
}) {
  const hasLogo = typeof logoUrl === "string" && logoUrl.startsWith("http");
  return (
    <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2.5 rounded-lg outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]"
        >
          {hasLogo ? (
            <img
              src={logoUrl}
              alt={companyName}
              className="h-10 w-10 shrink-0 rounded-xl object-contain bg-white p-1 shadow-sm ring-1 ring-black/5"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
              <span className="text-base font-black">{companyName.charAt(0) || "V"}</span>
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-base font-bold leading-tight text-foreground">
              {companyName}
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/catalogos"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:px-3"
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Catálogos</span>
          </Link>
          <AccountMenu />
          <CartDrawer globalMinOrder={globalMinOrder} catalogs={catalogs} />
        </nav>
      </div>
    </header>
  );
}
