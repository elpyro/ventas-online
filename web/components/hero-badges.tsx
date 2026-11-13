"use client";

import { useState } from "react";
import { X } from "lucide-react";

export type HeroBadge = { text: string; description: string };

function normalize(raw: unknown): HeroBadge[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => {
      if (typeof b === "string") return { text: b.trim(), description: "" };
      if (b && typeof b === "object") {
        const m = b as Record<string, unknown>;
        const text = String(m.text ?? m.title ?? "").trim();
        const description = String(m.description ?? "").trim();
        return { text, description };
      }
      return { text: "", description: "" };
    })
    .filter((b) => b.text.length > 0);
}

/**
 * Badges del hero con diálogo descriptivo.
 * Si el badge tiene descripción (cargada en Config), al tocarlo
 * abre un cuadro con un título llamativo y el contenido.
 */
export function HeroBadges({ badges }: { badges: unknown }) {
  const list = normalize(badges);
  const [selected, setSelected] = useState<HeroBadge | null>(null);

  const defaults: HeroBadge[] = [
    { text: "Entrega a domicilio", description: "" },
    { text: "Confirmación por WhatsApp", description: "" },
    { text: "Venta al por mayor", description: "" },
  ];
  const items = list.length > 0 ? list : defaults;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-blue-100">
        {items.map((badge, i) => {
          const hasDesc = badge.description.length > 0;
          const content = (
            <>
              {badge.text}
              {hasDesc && <span aria-hidden className="opacity-70">·</span>}
            </>
          );
          return hasDesc ? (
            <button
              key={`${badge.text}-${i}`}
              type="button"
              onClick={() => setSelected(badge)}
              className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 transition-colors hover:bg-white/10"
              title={badge.text}
            >
              {content}
            </button>
          ) : (
            <span
              key={`${badge.text}-${i}`}
              className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5"
            >
              {content}
            </span>
          );
        })}
      </div>

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selected.text}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 text-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-xl font-extrabold leading-snug sm:text-2xl">{selected.text}</h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Cerrar"
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
              {selected.description}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
