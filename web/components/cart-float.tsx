"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { useCart } from "@/lib/cart";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});

/** La barra flotante no se muestra sobre el carrito ni la confirmación. */
export function cartBarVisible(pathname: string, count: number): boolean {
  if (count <= 0) return false;
  return !pathname.startsWith("/carrito") && !pathname.startsWith("/checkout");
}

/**
 * Botón grande flotante que aparece cuando hay productos en el carrito.
 * Muestra cantidad de ítems, total y un acceso directo al carrito.
 */
export function CartFloat() {
  const { items, total, count } = useCart();
  const pathname = usePathname();
  if (!cartBarVisible(pathname, count)) return null;

  return (
    <Link
      href="/carrito"
      aria-label={`Ver carrito: ${count} ${count === 1 ? "ítem" : "ítems"}, total ${cop.format(total)}`}
      data-testid="cart-float"
      className="group fixed left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-2xl shadow-primary/40 ring-1 ring-white/20 transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] sm:py-4"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <span className="flex items-center gap-3">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 sm:h-12 sm:w-12">
          <ShoppingCart className="h-6 w-6" />
          <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] font-extrabold text-primary shadow">
            {count > 99 ? "99+" : count}
          </span>
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary-foreground/80">
            {count} {count === 1 ? "ítem" : "ítems"}
          </span>
          <span className="text-base font-extrabold sm:text-lg">
            {cop.format(total)}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold transition-colors group-hover:bg-white/25">
        Ver carrito
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
