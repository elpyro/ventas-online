"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useCart, cartKey } from "@/lib/cart";
import { toast } from "@/hooks/use-toast";
import { matchesProduct } from "@/lib/search";
import type { Product, ProductSort } from "@/lib/types";
import {
  productStock,
  productAvailable,
  productVisible,
  sortProducts,
  PRODUCT_SORT_OPTIONS,
} from "@/lib/types";
import {
  ShoppingCart,
  PackageOpen,
  CircleAlert,
  Loader2,
  Search,
  X,
  ArrowUpDown,
  Star,
  Minus,
  Plus,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});

export default function CatalogoClient({
  id,
  catalogTitle,
  initialProducts = [],
}: {
  id: string;
  catalogTitle?: string;
  /** Productos precargados en servidor: el grid viene ya en el HTML (SEO/IA). */
  initialProducts?: Product[];
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [loading, setLoading] = useState(initialProducts.length === 0);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProductSort>("displayOrder");
  const { addItem, items, updateQty } = useCart();

  useEffect(() => {
    if (!id) return;
    // Refresco silencioso en segundo plano cuando ya vienen precargados.
    setError("");
    (async () => {
      try {
        const q = query(
          collection(db, "products"),
          where("catalogIds", "array-contains", id)
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => d.data() as Product);
        setProducts(sortProducts(list, "displayOrder"));
      } catch (e: unknown) {
        console.error(e);
        // Datos precargados siguen siendo válidos; solo avisamos si no había nada.
        if (products.length === 0) {
          setError("No se pudieron cargar los productos. Revisa la conexión.");
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const filtered = useMemo(() => {
    const visible = products.filter(productVisible);
    const list = search.trim()
      ? visible.filter((p) => matchesProduct(p, search))
      : visible;
    return sortProducts(list, sort);
  }, [products, search, sort]);

  function handleAdd(p: Product) {
    const inCart = items
      .filter((i) => i.sku === p.sku)
      .reduce((sum, i) => sum + i.quantity, 0);
    const stock = productStock(p);
    if (inCart >= stock) {
      toast({
        title: "No hay más stock disponible",
        description: `${p.name}: ya agregaste las ${stock} unidades disponibles.`,
        variant: "destructive",
      });
      return;
    }
    addItem(p, id);
    toast({
      title: "Agregado al carrito",
      description: `${p.name} · ${cop.format(p.price)}`,
      variant: "success",
    });
  }

  function handleRemoveOne(p: Product) {
    // Solo aplica a productos sin variantes: una única línea con clave "SKU".
    const added = items
      .filter((i) => i.sku === p.sku)
      .reduce((sum, i) => sum + i.quantity, 0);
    updateQty(cartKey(p.sku), added - 1);
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-4 px-4 py-24 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p>Cargando catálogo…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <CircleAlert className="h-6 w-6 shrink-0" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{catalogTitle ?? "Catálogo"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.length}{" "}
            {filtered.length === 1 ? "producto" : "productos"}
            {search.trim() && ` de ${products.length}`}
          </p>
        </div>

        {/* Buscador + orden: en móvil van apilados, en escritorio en fila */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full flex-1">
            <label className="sr-only" htmlFor="catalog-search">
              Buscar en el catálogo
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="catalog-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto, marca o SKU…"
              className="h-11 w-full rounded-xl border bg-white pl-10 pr-10 text-sm shadow-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Borrar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="relative w-full sm:w-64">
            <label className="sr-only" htmlFor="catalog-sort">
              Ordenar productos
            </label>
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              id="catalog-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as ProductSort)}
              className="h-11 w-full appearance-none rounded-xl border bg-white pl-10 pr-8 text-sm shadow-sm outline-none transition-shadow focus:ring-2 focus:ring-primary"
            >
              {PRODUCT_SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">▾</span>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border bg-white p-12 text-center text-muted-foreground">
          <PackageOpen className="h-10 w-10" />
          <p className="font-medium">
            {search.trim()
              ? `Ningún producto coincide con “${search.trim()}”.`
              : "Este catálogo no tiene productos todavía."}
          </p>
          {search.trim() && (
            <Button variant="outline" onClick={() => setSearch("")}>
              Borrar búsqueda
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((p) => {
            const added = items
              .filter((i) => i.sku === p.sku)
              .reduce((sum, i) => sum + i.quantity, 0);
            const stock = productStock(p);
            const available = productAvailable(p);
            const hasVariants = Boolean(p.variants?.length);
            const limitReached = available && !hasVariants && added >= stock;
            const href = `/producto/${encodeURIComponent(p.sku)}?catalogo=${encodeURIComponent(id)}`;

            return (
              <Card
                key={p.sku}
                data-testid={`product-${p.sku}`}
                className={cn(
                  "group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
                  !available && "select-none opacity-60 grayscale"
                )}
              >
                {added > 0 && (
                  <Badge className="absolute right-2 top-2 z-10 bg-primary px-2 py-0.5 text-[11px] shadow">
                    {added} en carrito
                  </Badge>
                )}
                {!available && (
                  <Badge className="absolute left-2 top-2 z-10 bg-slate-900 px-2 py-0.5 text-[11px] text-white">
                    Agotado
                  </Badge>
                )}
                {available && p.featured && (
                  <Badge className="absolute left-2 top-2 z-10 gap-1 bg-gradient-to-r from-amber-400 to-amber-500 px-2 py-0.5 text-[11px] font-bold text-black shadow">
                    <Star className="h-3 w-3 fill-black" /> Destacado
                  </Badge>
                )}
                {limitReached && (
                  <Badge className="absolute left-2 top-2 z-10 border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
                    En carrito: {stock} uds.
                  </Badge>
                )}
                <Link
                  href={href}
                  className="relative block aspect-square overflow-hidden bg-slate-100"
                  aria-label={`Ver ${p.name}`}
                >
                  <img
                    src={p.images?.[0] ?? ""}
                    alt={p.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {p.brand && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700 shadow-sm backdrop-blur">
                      {p.brand}
                    </span>
                  )}
                </Link>
                <CardContent className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
                  <Link href={href} className="block">
                    <h3 className="line-clamp-2 min-h-[2.5rem] text-[13px] font-semibold leading-snug sm:text-sm hover:text-primary hover:underline">
                      {p.name}
                    </h3>
                  </Link>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-1">
                    <p className="text-base font-extrabold text-primary sm:text-lg">
                      {cop.format(Number(p.price))}
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        available
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-600"
                      )}
                    >
                      {available ? `${stock} disp.` : "Sin stock"}
                    </span>
                  </div>
                  {hasVariants ? (
                    <Button asChild className="h-9 w-full rounded-xl text-xs sm:text-sm">
                      <Link href={href} data-testid={`add-${p.sku}`}>
                        <ShoppingCart className="h-4 w-4" />
                        {available ? "Elegir opciones" : "Ver detalle"}
                      </Link>
                    </Button>
                  ) : !available ? (
                    <Button
                      data-testid={`add-${p.sku}`}
                      disabled
                      variant="secondary"
                      className="h-9 w-full rounded-xl text-xs sm:text-sm"
                    >
                      Agotado
                    </Button>
                  ) : added === 0 ? (
                    <Button
                      data-testid={`add-${p.sku}`}
                      onClick={() => handleAdd(p)}
                      className="h-9 w-full rounded-xl text-xs sm:text-sm"
                    >
                      <Plus className="h-4 w-4" />
                      Agregar
                    </Button>
                  ) : (
                    <div
                      className="flex h-9 w-full items-stretch overflow-hidden rounded-xl border border-primary/40 bg-primary/5"
                      role="group"
                      aria-label={`Cantidad de ${p.name}`}
                    >
                      <button
                        type="button"
                        aria-label="Quitar uno"
                        data-testid={`dec-${p.sku}`}
                        onClick={() => handleRemoveOne(p)}
                        className="flex w-11 items-center justify-center text-primary transition-colors hover:bg-primary/10"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span
                        data-testid={`qty-${p.sku}`}
                        className="flex flex-1 items-center justify-center text-sm font-bold"
                      >
                        {added}
                      </span>
                      <button
                        type="button"
                        aria-label="Agregar uno más"
                        data-testid={`inc-${p.sku}`}
                        disabled={limitReached}
                        onClick={() => handleAdd(p)}
                        className="flex w-11 items-center justify-center text-primary transition-colors hover:bg-primary/10 disabled:opacity-30"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
