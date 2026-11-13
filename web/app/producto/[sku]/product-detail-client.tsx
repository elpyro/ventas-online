"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCart, cartKey } from "@/lib/cart";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Product, ProductVariant } from "@/lib/types";
import { productStock, effectivePrice, productAvailable } from "@/lib/types";
import { ProductGallery, type GalleryMedia } from "@/components/product-gallery";
import { ShareProductButton } from "@/components/share-product-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CircleAlert,
  ShoppingCart,
  Truck,
  ChevronRight,
  Package,
} from "lucide-react";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});

export default function ProductDetailClient({
  product,
  catalogId,
  catalogTitle,
  canonicalUrl,
}: {
  product: Product;
  catalogId: string;
  catalogTitle: string;
  canonicalUrl: string;
}) {
  const { addItem, updateQty, items } = useCart();
  const variants = product.variants ?? [];
  const hasVariants = variants.length > 0;

  const [color, setColor] = useState<string>("");
  const [size, setSize] = useState<string>("");
  const [qty, setQty] = useState(1);

  // Colores y tallas únicos disponibles en las variantes.
  const colors = useMemo(() => {
    const seen = new Map<string, string | undefined>();
    for (const v of variants) {
      if (v.color && !seen.has(v.color)) seen.set(v.color, v.colorHex);
    }
    return [...seen.entries()].map(([name, hex]) => ({ name, hex }));
  }, [variants]);

  const sizes = useMemo(() => {
    const set = new Set<string>();
    for (const v of variants) if (v.size) set.add(v.size);
    return [...set];
  }, [variants]);

  // Variantes efectivas para la combinación elegida.
  const filtered = useMemo(() => {
    return variants.filter((v) => {
      if (color && v.color !== color) return false;
      if (size && v.size !== size) return false;
      return true;
    });
  }, [variants, color, size]);

  // Al cambiar el color, prioriza una talla que sí exista en ese color.
  useEffect(() => {
    if (!hasVariants) return;
    const compatible = variants.filter((v) => !color || v.color === color);
    if (size && compatible.some((v) => v.size === size)) return;
    const next = compatible.find((v) => v.size)?.size ?? "";
    setSize(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  // Selección por defecto: la primera variante con stock (o la primera).
  useEffect(() => {
    if (!hasVariants || color || size) return;
    const initial =
      variants.find((v) => Number(v.stock) > 0) ?? variants[0];
    if (initial) {
      setColor(initial.color ?? "");
      setSize(initial.size ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVariants]);

  const exactVariant: ProductVariant | null = useMemo(() => {
    if (!hasVariants) return null;
    return (
      variants.find(
        (v) =>
          (!color || v.color === color) && (!size || v.size === size)
      ) ?? null
    );
  }, [variants, color, size, hasVariants]);

  const selectedVariant =
    hasVariants && filtered.length === 1 ? filtered[0] : exactVariant;

  const availableColors = useMemo(() => {
    if (!color) return colors;
    return colors; // todos se muestran; se deshabilitan si no tienen stock
  }, [colors, color]);

  const sizesForColor = useMemo(() => {
    const compatible = variants.filter((v) => !color || v.color === color);
    return new Set(compatible.map((v) => v.size).filter(Boolean) as string[]);
  }, [variants, color]);

  const variantStock = selectedVariant ? Number(selectedVariant.stock) || 0 : 0;
  const totalStock = productStock(product);
  const effectiveStock = hasVariants ? variantStock : Number(product.stock ?? 0);
  const limit = Math.max(0, effectiveStock);

  // Lo que ya está en el carrito para esta variante (o para el SKU simple).
  const inCartQty = items
    .filter(
      (i) => cartKey(i.sku, i.variantId) === cartKey(product.sku, selectedVariant?.id)
    )
    .reduce((sum, i) => sum + i.quantity, 0);

  // `qty` es el TOTAL que quieres tener en el carrito, no unidades nuevas.
  // Por eso arranca en lo que ya hay guardado y el tope es el stock completo.
  useEffect(() => {
    setQty(Math.max(1, Math.min(inCartQty || 1, Math.max(1, limit))));
  }, [inCartQty, limit]);

  // Diferencia entre lo deseado y lo guardado: positiva agrega, negativa ajusta.
  const delta = qty - inCartQty;

  const available = productAvailable(product);

  const canAdd =
    available &&
    limit > 0 &&
    delta !== 0 &&
    (!hasVariants || Boolean(selectedVariant));

  const unitPrice = effectivePrice(product, selectedVariant);

  const inCartTotal = items
    .filter((i) => i.sku === product.sku)
    .reduce((sum, i) => sum + i.quantity, 0);

  function handleAdd() {
    if (!available || limit === 0) {
      toast({
        title: "Sin stock",
        description: `${product.name} no tiene unidades disponibles.`,
        variant: "destructive",
      });
      return;
    }
    if (hasVariants && !selectedVariant) {
      toast({
        title: "Elige una opción",
        description: "Selecciona color y talla antes de agregar.",
        variant: "destructive",
      });
      return;
    }
    if (delta === 0) return;

    if (delta > 0) {
      addItem(product, catalogId, delta, selectedVariant);
    } else {
      updateQty(cartKey(product.sku, selectedVariant?.id), qty);
    }
  }

  const media: GalleryMedia[] = [
    ...(product.images ?? []).map((url) => ({ type: "image" as const, url })),
    ...(product.videoUrl
      ? [
          {
            type: "video" as const,
            url: product.videoUrl,
            poster: product.videoThumbnail ?? product.images?.[0],
          },
        ]
      : []),
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Link
        href={`/catalogo/${encodeURIComponent(catalogId)}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a {catalogTitle}
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-2">
        {/* Galería */}
        <ProductGallery media={media} title={product.name} />

        {/* Compra */}
        <div className="flex flex-col gap-4">
          <div>
            {product.brand && (
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {product.brand}
              </p>
            )}
            <h1 className="mt-1 text-2xl font-bold leading-snug sm:text-3xl">
              {product.name}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              SKU: {product.sku} · {catalogTitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-4xl font-extrabold text-primary">
              {cop.format(unitPrice)}
            </p>
            {!available ? (
              <Badge className="bg-slate-800 text-white">Agotado</Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-300 text-emerald-800">
                Disponible
              </Badge>
            )}
          </div>

          {/* Colores */}
          {colors.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Color{color ? `: ${color}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {availableColors.map((c) => {
                  const isSelected = color === c.name;
                  const compatible = variants.filter((v) => v.color === c.name);
                  const hasStock = compatible.some((v) => Number(v.stock) > 0);
                  return (
                    <button
                      key={c.name}
                      type="button"
                      disabled={!hasStock}
                      onClick={() => setColor(c.name)}
                      aria-pressed={isSelected}
                      title={hasStock ? c.name : `${c.name} — sin stock`}
                      className={cn(
                        "flex h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-all",
                        isSelected
                          ? "border-primary ring-2 ring-primary"
                          : "hover:border-primary",
                        !hasStock && "cursor-not-allowed opacity-50"
                      )}
                    >
                      {c.hex && (
                        <span
                          className="h-5 w-5 rounded-full border border-black/10"
                          style={{ backgroundColor: c.hex }}
                          aria-hidden="true"
                        />
                      )}
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tallas / medidas */}
          {sizes.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Talla / Medida{size ? `: ${size}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sizes.map((s) => {
                  const isSelected = size === s;
                  const compatible = variants.filter(
                    (v) => v.size === s && (!color || v.color === color)
                  );
                  const hasStock =
                    sizesForColor.has(s) &&
                    compatible.some((v) => Number(v.stock) > 0);
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={!hasStock}
                      onClick={() => setSize(s)}
                      aria-pressed={isSelected}
                      className={cn(
                        "min-w-12 rounded-lg border px-3 py-2 text-sm font-semibold transition-all",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:border-primary",
                        !hasStock && "cursor-not-allowed opacity-40 line-through"
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hasVariants && !selectedVariant && (
            <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <CircleAlert className="h-4 w-4 shrink-0" />
              Esta combinación no está disponible. Elige otra opción.
            </p>
          )}

          {/* Cantidad y agregar */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label
                htmlFor="qty"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Cantidad
              </label>
              <div className="mt-1 flex items-center rounded-xl border">
                <button
                  aria-label="Menos"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  className="h-12 w-12 rounded-l-xl text-lg font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
                  disabled={qty <= 1}
                >
                  −
                </button>
                <input
                  id="qty"
                  inputMode="numeric"
                  value={limit === 0 ? 0 : Math.min(qty, limit)}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                    if (Number.isFinite(n)) {
                      setQty(Math.min(Math.max(n, 1), Math.max(1, limit)));
                    }
                  }}
                  className="h-12 w-14 border-x text-center text-lg font-bold outline-none"
                />
                <button
                  aria-label="Más"
                  onClick={() => setQty(Math.min(limit, qty + 1))}
                  className="h-12 w-12 rounded-r-xl text-lg font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
                  disabled={limit === 0 || qty >= limit}
                >
                  +
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground" data-testid="qty-help">
                {limit === 0
                  ? "Sin stock"
                  : `${limit} unidad(es) disponibles${
                      inCartQty > 0 ? ` · ${inCartQty} en tu carrito` : ""
                    }`}
              </p>
            </div>

            <Button
              size="lg"
              className="h-12 flex-1 text-base"
              disabled={!canAdd}
              onClick={handleAdd}
              data-testid="add-to-cart"
            >
              <ShoppingCart className="h-5 w-5" />
              {!available || limit === 0
                ? "Agotado"
                : delta === 0
                  ? "En el carrito"
                  : delta < 0
                    ? "Actualizar carrito"
                    : "Agregar"}
            </Button>

            <ShareProductButton url={canonicalUrl} name={product.name} price={unitPrice} />
          </div>

          {inCartTotal > 0 && (
            <p className="text-xs font-medium text-muted-foreground">
              Tienes {inCartTotal} unidad(es) de este producto en tu carrito.
            </p>
          )}

          <p className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            <Truck className="mt-0.5 h-4 w-4 shrink-0" />
            Un asesor coordinará por WhatsApp la entrega y el pago una vez que confirmes el pedido.
          </p>
        </div>
      </div>

      {/* Descripción y especificaciones */}
      <div className="mt-10 grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Package className="h-5 w-5" />
            Descripción
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
            {product.description?.trim() ||
              "El administrador aún no agregó una descripción para este producto."}
          </p>

          {product.specs && product.specs.length > 0 && (
            <>
              <h3 className="mt-6 text-lg font-bold">Especificaciones</h3>
              <div className="mt-2 overflow-hidden rounded-xl border">
                <dl className="grid grid-cols-[minmax(0,10rem)_1fr] divide-y text-sm">
                  {product.specs.map((spec, i) => (
                    <div
                      key={`${spec.label}-${i}`}
                      className="col-span-2 grid grid-cols-subgrid"
                    >
                      <dt className="bg-muted px-4 py-2.5 font-medium text-muted-foreground">
                        {spec.label}
                      </dt>
                      <dd className="px-4 py-2.5">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </>
          )}

          {product.tags && product.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {product.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/buscar?q=${encodeURIComponent(tag)}`}
                  className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
