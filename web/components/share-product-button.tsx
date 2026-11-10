"use client";
import { useState } from "react";
import { Share2, Check, Link2, MessageCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Compartir el producto: primero el menú nativo del celular;
 * si no existe, copia el enlace; siempre ofrece WhatsApp.
 */
export function ShareProductButton({
  url,
  name,
  price,
}: {
  url: string;
  name: string;
  price: number;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const text = `${name} · $${price.toFixed(2)}`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: name, text, url });
        return;
      }
      throw new Error("share-not-supported");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast({ title: "Enlace copiado", description: "Pégalo donde quieras compartirlo." });
        window.setTimeout(() => setCopied(false), 2500);
      } catch {
        toast({
          title: "No se pudo copiar",
          description: "Copia la dirección del navegador.",
          variant: "destructive",
        });
      }
    }
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `Mira este producto: ${name} · $${price.toFixed(2)} — ${url}`
  )}`;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        data-testid="share-product"
        onClick={handleShare}
        className="flex h-12 w-12 items-center justify-center rounded-lg border transition-all duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Compartir producto"
        title="Compartir producto"
      >
        {copied ? <Check className="h-5 w-5 text-emerald-600" /> : <Share2 className="h-5 w-5" />}
      </button>
      <a
        href={whatsapp}
        target="_blank"
        rel="noreferrer"
        data-testid="share-whatsapp"
        className="flex h-12 w-12 items-center justify-center rounded-lg border border-emerald-300 text-emerald-700 transition-all duration-150 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        aria-label="Compartir por WhatsApp"
        title="Compartir por WhatsApp"
      >
        <MessageCircle className="h-5 w-5" />
      </a>
    </div>
  );
}
