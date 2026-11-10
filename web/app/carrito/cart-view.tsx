"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBasket,
  Minus,
  Plus,
  Trash2,
  ArrowRight,
  Truck,
} from "lucide-react";

import { useCart } from "@/lib/cart";
import { buildMinimumLines } from "@/components/cart-drawer";
import { MinimumOrderHint } from "@/components/minimum-order-hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface CarritoCatalog {
  id: string;
  title: string;
  minOrderSubtotal: number;
}

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});

export default function CartView({
  globalMinOrder,
  catalogs,
}: {
  globalMinOrder: number;
  catalogs: CarritoCatalog[];
}) {
  const router = useRouter();
  const { items, total, updateQty, removeItem, clear } = useCart();

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border bg-white p-10 shadow-sm">
          <div className="rounded-full bg-muted p-4">
            <ShoppingBasket className="h-10 w-10 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Tu carrito está vacío</h1>
          <p className="text-sm text-muted-foreground">
            Navega los catálogos y agrega productos; el mínimo global es $
            {globalMinOrder.toFixed(2)}.
          </p>
          <Button size="lg" onClick={() => router.push("/catalogos")}>
            Explorar catálogos
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </main>
    );
  }

  const minLines = buildMinimumLines(items, globalMinOrder, catalogs);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Carrito</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "producto" : "productos"} ·{" "}
            {items.reduce((s, i) => s + i.quantity, 0)} unidades
          </p>
        </div>
        <button
          onClick={clear}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-red-600"
        >
          Vaciar carrito
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Lista de productos */}
        <div className="space-y-3 lg:col-span-2">
          {items.map((item) => (
            <Card key={item.key}>
              <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <img
                  src={item.image ?? ""}
                  alt={item.name}
                  className="h-20 w-20 rounded-lg object-cover sm:h-24 sm:w-24"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/producto/${encodeURIComponent(item.sku)}?catalogo=${item.catalogId}`}
                    className="hover:text-primary hover:underline"
                  >
                    <p className="truncate font-medium" title={item.name}>
                      {item.name}
                    </p>
                  </Link>
                  {item.variantLabel && (
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                      {item.variantLabel}
                    </p>
                  )}
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {cop.format(item.price)} c/u
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      aria-label="Quitar uno"
                      onClick={() => updateQty(item.key, item.quantity - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border transition-all hover:bg-muted active:scale-90"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center font-semibold">
                      {item.quantity}
                    </span>
                    <button
                      aria-label="Agregar uno"
                      onClick={() => updateQty(item.key, item.quantity + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border transition-all hover:bg-muted active:scale-90"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="Quitar del carrito"
                      onClick={() => removeItem(item.key)}
                      className="ml-auto rounded-full p-2 text-red-500 transition-colors hover:bg-red-50"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="hidden text-xs text-muted-foreground sm:block">
                    Subtotal
                  </p>
                  <p className="font-bold">{cop.format(item.price * item.quantity)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Resumen */}
        <div className="lg:col-span-1">
          <Card className="sticky top-24">
            <CardContent className="space-y-4 p-5">
              <h2 className="font-semibold">Resumen</h2>
              <MinimumOrderHint lines={minLines} />
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-muted-foreground">Total</span>
                <span className="text-2xl font-extrabold">{cop.format(total)}</span>
              </div>
              <Button size="lg" className="w-full" onClick={() => router.push("/checkout")}>
                Ir a checkout
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Link
                href="/catalogos"
                className="block text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                ← Seguir comprando
              </Link>
              <p className="flex items-center justify-center gap-1.5 border-t pt-3 text-[11px] text-muted-foreground">
                <Truck className="h-4 w-4" /> Confirmación y coordinación por WhatsApp
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
