"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

import { useCart } from "@/lib/cart";
import { cartBarVisible } from "@/components/cart-float";
import { waDigits, waLink as buildWaLink } from "@/lib/whatsapp";

function waLink(phone: string): string {
  const link = buildWaLink(phone, "Hola, quiero información de un producto.");
  // list ya filtró números válidos; esta rama nunca debería verse.
  return link ?? `https://wa.me/${waDigits(phone)}`;
}

/** Logo oficial de WhatsApp (simple-icons, CC0). */
function WhatsAppLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label="WhatsApp"
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

/**
 * Botón flotante global de WhatsApp.
 * Usa el teléfono principal de Config; si hay segundo número, abre un
 * desplegable para elegir entre los dos.
 */
export function WhatsappFloat({ phones }: { phones: string[] }) {
  const pathname = usePathname();
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const list = (phones ?? [])
    .map((p) => String(p ?? "").trim())
    .filter((p) => waDigits(p).length >= 8);
  if (list.length === 0) return null;

  // Por encima de la barra flotante del carrito si está visible.
  const position = cartBarVisible(pathname, count)
    ? "bottom-24"
    : "bottom-5";

  if (list.length === 1) {
    return (
      <a
        href={waLink(list[0])}
        target="_blank"
        rel="noreferrer"
        aria-label="Hablar por WhatsApp"
        className={`fixed right-4 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl ring-4 ring-white/70 transition-all hover:scale-105 sm:right-5 ${position}`}
      >
        <WhatsAppLogo className="h-9 w-9" />
        <span className="absolute -left-1 -top-1 flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-75" />
          <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-white bg-[#25D366]" />
        </span>
      </a>
    );
  }

  return (
    <div className={`fixed right-4 z-50 flex flex-col items-end gap-2 sm:right-5 ${position}`}>
      {open && (
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-black/10">
          {list.map((p, i) => (
            <a
              key={`${p}-${i}`}
              href={waLink(p)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#25D366]/15 text-[#128C7E]">
                <WhatsAppLogo className="h-4 w-4" />
              </span>
              WhatsApp {i + 1}
              <span className="text-xs text-muted-foreground">· {p}</span>
            </a>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar WhatsApp" : "Hablar por WhatsApp"}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl ring-4 ring-white/70 transition-transform hover:scale-105"
      >
        {open ? <X className="h-8 w-8" /> : <WhatsAppLogo className="h-9 w-9" />}
      </button>
    </div>
  );
}
