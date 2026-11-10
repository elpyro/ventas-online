"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function waLink(phone: string): string {
  const d = digits(phone);
  const text = encodeURIComponent("Hola, quiero información de un producto.");
  return `https://wa.me/${d}?text=${text}`;
}

/**
 * Botón flotante global de WhatsApp.
 * Usa el teléfono principal de Config; si hay segundo número, abre un
 * desplegable para elegir entre los dos.
 */
export function WhatsappFloat({ phones }: { phones: string[] }) {
  const list = (phones ?? [])
    .map((p) => String(p ?? "").trim())
    .filter((p) => digits(p).length >= 8);
  const [open, setOpen] = useState(false);
  if (list.length === 0) return null;

  if (list.length === 1) {
    return (
      <a
        href={waLink(list[0])}
        target="_blank"
        rel="noreferrer"
        aria-label="Hablar por WhatsApp"
        className="fixed bottom-5 right-5 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl ring-4 ring-white/70 transition-transform hover:scale-105"
      >
        <MessageCircle className="h-9 w-9" />
        <span className="absolute -left-1 -top-1 flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-75" />
          <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-white bg-[#25D366]" />
        </span>
      </a>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
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
                <MessageCircle className="h-4 w-4" />
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
        {open ? <X className="h-8 w-8" /> : <MessageCircle className="h-9 w-9" />}
      </button>
    </div>
  );
}
