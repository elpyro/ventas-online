import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { productStock, productAvailable, type Product } from "@/lib/types";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});

/** Tarjeta compacta de producto: imagen, marca, precio y enlace a la ficha. */
export function ProductCard({
  product,
  catalogId,
  showCatalog,
}: {
  product: Product;
  catalogId?: string;
  showCatalog?: string;
}) {
  const stock = productStock(product);
  const available = productAvailable(product);
  const primaryCatalog =
    catalogId ?? (Array.isArray(product.catalogIds) ? product.catalogIds[0] : undefined);
  const href = `/producto/${encodeURIComponent(product.sku)}${
    primaryCatalog ? `?catalogo=${encodeURIComponent(primaryCatalog)}` : ""
  }`;

  return (
    <Link
      href={href}
      data-testid={`product-card-${product.sku}`}
      className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Card
        className={cn(
          "overflow-hidden rounded-2xl bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/5 transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_12px_24px_rgba(0,0,0,0.12)] group-hover:ring-black/10",
          !available && "opacity-60 grayscale"
        )}
      >
        <div className="relative aspect-square overflow-hidden bg-slate-100">
          <img
            src={product.images?.[0] ?? ""}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {!available && (
            <Badge className="absolute left-2 top-2 bg-slate-900 text-[11px] text-white">
              Agotado
            </Badge>
          )}
          {available && product.featured && (
            <Badge className="absolute left-2 top-2 gap-1 bg-gradient-to-r from-amber-400 to-amber-500 text-[11px] font-bold text-black shadow">
              <Star className="h-3 w-3 fill-black" /> Destacado
            </Badge>
          )}
          {product.brand && (
            <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 shadow-sm backdrop-blur">
              {product.brand}
            </span>
          )}
        </div>
        <CardContent className="space-y-1.5 p-3 sm:p-4">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug sm:text-sm">
            {product.name}
          </h3>
          {showCatalog && (
            <p className="text-xs text-muted-foreground">{showCatalog}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-1 pt-1">
            <p className="text-base font-extrabold text-primary sm:text-lg">
              {cop.format(product.price)}
            </p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                available
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-600"
              )}
            >
              {product.variants?.length
                ? `${product.variants.length} opciones`
                : available
                  ? `${stock} disp.`
                  : "Sin stock"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
