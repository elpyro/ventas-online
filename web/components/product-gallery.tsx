"use client";
import { useCallback, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type GalleryMedia =
  | { type: "image"; url: string }
  | { type: "video"; url: string; poster?: string };

/**
 * Galería de la ficha: miniaturas, imagen principal y video nativo.
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
  const safeMedia = useMemo(
    () => media.filter((m) => typeof m.url === "string" && m.url.length > 0),
    [media]
  );
  const current = safeMedia[Math.min(index, safeMedia.length - 1)];

  const go = useCallback((next: number) => {
    setIndex((i) => {
      const len = safeMedia.length;
      if (len === 0) return 0;
      return ((next % len) + len) % len;
    });
  }, [safeMedia.length]);

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
          <img
            key={current?.url}
            src={current?.url ?? ""}
            alt={title}
            className="aspect-[4/3] w-full object-contain"
          />
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
    </div>
  );
}
