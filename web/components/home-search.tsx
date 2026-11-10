"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Loader2, X, ArrowRight } from "lucide-react";

type SearchResult = {
  sku: string;
  name: string;
  price: number;
  brand: string;
  image: string;
  stock: number;
  hasVariants: boolean;
  catalogId: string;
};

/**
 * Buscador global de la portada: consulta el API con un pequeño retraso
 * y lleva al usuario a /buscar para ver todos los resultados.
 */
export function HomeSearch({
  catalogs,
}: {
  catalogs: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Consulta diferida: solo cuando el usuario deja de escribir ~200 ms.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as { results?: SearchResult[] };
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Cerrar el desplegable al hacer clic fuera.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function catalogTitle(id: string): string {
    return catalogs.find((c) => c.id === id)?.title ?? id;
  }

  function submit() {
    const q = query.trim();
    if (q) {
      setOpen(false);
      router.push(`/buscar?q=${encodeURIComponent(q)}`);
    }
  }

  return (
    <div className="relative mt-6 w-full max-w-xl" ref={containerRef}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="relative"
      >
        <label className="sr-only" htmlFor="home-search">
          Buscar productos
        </label>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-200" />
        <input
          id="home-search"
          type="search"
          autoComplete="off"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Busca productos, marcas o catálogos…"
          className="w-full rounded-2xl border border-white/25 bg-white/10 px-4 py-3.5 pl-12 pr-12 text-base text-white shadow-lg outline-none backdrop-blur placeholder:text-blue-200 focus:border-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/30"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Borrar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-blue-100 transition-colors hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </form>

      {open && query.trim().length >= 2 && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border bg-white text-foreground shadow-2xl ring-1 ring-black/5">
          {loading && (
            <p className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
            </p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Sin resultados para “{query.trim()}”.
            </p>
          )}
          {results.length > 0 && (
            <>
              <ul className="max-h-96 divide-y overflow-y-auto">
                {results.map((r) => (
                  <li key={r.sku}>
                    <Link
                      href={`/producto/${encodeURIComponent(r.sku)}?catalogo=${encodeURIComponent(r.catalogId)}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <img
                        src={r.image}
                        alt={r.name}
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        {r.brand && (
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {r.brand}
                          </span>
                        )}
                        <span className="block truncate text-sm font-semibold">
                          {r.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {catalogTitle(r.catalogId)}
                          {r.hasVariants
                            ? " · varias opciones"
                            : r.stock <= 0
                              ? " · agotado"
                              : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-primary">
                        ${r.price.toFixed(2)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={submit}
                className="flex w-full items-center justify-center gap-2 border-t px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-muted"
              >
                Ver todos los resultados
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
