"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

export type GalleryMedia =
  | { type: "image"; url: string }
  | { type: "video"; url: string; poster?: string };

/**
 * Galería de la ficha: miniaturas, imagen principal, video nativo y
 * lightbox a pantalla completa (tap en la imagen, navegación y zoom 1x/2x).
 * No depende de librerías: los videos subidos desde el admin son MP4.
 */
export function ProductGallery({
  media,
  title,
}: {
  media: GalleryMedia[];
  title: string;
}) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const safeMedia = useMemo(
    () => media.filter((m) => typeof m.url === "string" && m.url.length > 0),
    [media]
  );
  const current = safeMedia[Math.min(index, safeMedia.length - 1)];
  const imageCount = safeMedia.filter((m) => m.type === "image").length;

  const go = useCallback((next: number) => {
    setIndex((i) => {
      const len = safeMedia.length;
      if (len === 0) return 0;
      return ((next % len) + len) % len;
    });
    setZoomed(false);
  }, [safeMedia.length]);

  const closeLightbox = useCallback(() => {
    setLightbox(false);
    setZoomed(false);
  }, []);

  // Clic para abrir/cerrar el lightbox (doble clic alterna zoom)
  const toggleLightbox = useCallback(() => {
    setLightbox((open) => {
      if (!open) setZoomed(false);
      return !open;
    });
  }, []);

  const toggleZoom = useCallback(() => setZoomed((z) => !z), []);

  // Navegación con teclado dentro del lightbox.
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
      else if (e.key === "ArrowRight" && imageCount > 1) go(index + 1);
      else if (e.key === "ArrowLeft" && imageCount > 1) go(index - 1);
      else if (e.key === "+" || e.key === "=") setZoomed(true);
      else if (e.key === "-") setZoomed(false);
    }
    window.addEventListener("keydown", onKey);
    // Bloquear scroll del cuerpo mientras el lightbox está abierto.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [lightbox, go, index, imageCount, closeLightbox]);

  if (safeMedia.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border bg-muted text-muted-foreground">
        Sin imagen
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border bg-muted">
        {current?.type === "video" ? (
          <video
            key={current.url}
            controls
            preload="metadata"
            playsInline
            poster={current.poster}
            className="aspect-[4/3] w-full bg-black object-contain"
          >
            <source src={current.url} type="video/mp4" />
            Tu navegador no pudo reproducir este video. Prueba abrirlo en otra ventana.
          </video>
        ) : (
          <button
            type="button"
            onClick={toggleLightbox}
            aria-label={zoomed ? "Cerrar zoom" : "Ampliar foto"}
            onDoubleClick={toggleZoom}
            className="block w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <img
              key={current?.url}
              src={current?.url ?? ""}
              alt={title}
              className="aspect-[4/3] w-full object-contain"
            />
          </button>
        )}
        {current?.type !== "video" && (
          <button
            type="button"
            onClick={toggleZoom}
            aria-label={zoomed ? "Alejar" : "Acercar"}
            className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/70"
          >
            {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
          </button>
        )}
      </div>

      {safeMedia.length > 1 && (
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          role="tablist"
          aria-label="Fotos y video"
        >
          {safeMedia.map((item, i) => (
            <button
              key={`${item.type}-${item.url}-${i}`}
              role="tab"
              aria-selected={i === index}
              aria-label={item.type === "video" ? "Video" : `Foto ${i + 1}`}
              onClick={() => go(i)}
              className={cn(
                "relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-muted transition-all",
                i === index
                  ? "ring-2 ring-primary"
                  : "opacity-70 hover:opacity-100"
              )}
            >
              <img
                src={item.type === "image" ? item.url : (item.poster ?? "")}
                alt={item.type === "video" ? "Video" : `${title} ${i + 1}`}
                className="h-full w-full object-cover"
              />
              {item.type === "video" && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Play className="h-6 w-6 fill-white text-white" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Lightbox a pantalla completa (solo fotos). */}
      {lightbox && current?.type === "image" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Ampliar foto de ${title}`}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90"
          onClick={closeLightbox}
        >
          <button
            type="button"
            onClick={closeLightbox}
            aria-label="Cerrar"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>

          {imageCount > 1 && (
            <>
              <button
                type="button"
                aria-label="Anterior"
                onClick={(e) => {
                  e.stopPropagation();
                  go(index - 1);
                }}
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                aria-label="Siguiente"
                onClick={(e) => {
                  e.stopPropagation();
                  go(index + 1);
                }}
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <img
            src={current?.url ?? ""}
            alt={title}
            onClick={(e) => {
              e.stopPropagation();
              toggleZoom();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className={cn(
              "max-h-[94vh] max-w-full select-none object-contain transition-transform duration-200",
              zoomed ? "scale-[2] cursor-zoom-out" : "cursor-zoom-in"
            )}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}
