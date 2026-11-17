"use client";
import { CheckCircle2, Trash2, PencilLine } from "lucide-react";

export type CheckoutAdjustment = {
  key: string;
  sku: string;
  name: string;
  image?: string;
  variantLabel?: string;
  unitPrice: number;
  previousQuantity: number;
  newQuantity: number; // 0 = el producto se eliminó del carrito
};

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/**
 * Cuadro de diálogo que muestra el detalle de los cambios hechos al
 * ajustar el carrito al stock real: producto, foto, cantidad y precio.
 * Reemplaza al toast — el cliente necesita ver exactamente qué cambió.
 */
export function CheckoutAdjustDialog({
  adjustments,
  onClose,
}: {
  adjustments: CheckoutAdjustment[];
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Carrito ajustado al stock disponible"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
    >
      <div className="flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start gap-3 border-b p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </span>
          <div>
            <h2 className="text-lg font-bold leading-snug">
              Tu pedido se ajustó al stock disponible
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Revisamos el stock real y lo que quedó en tu carrito podrás
              confirmarlo. Ningún producto quedó con una cantidad mayor a la
              que hay disponible.
            </p>
          </div>
        </div>

        <div className="overflow-y-auto p-4">
          <ul className="divide-y">
            {adjustments.map((a) => {
              const removed = a.newQuantity === 0;
              return (
                <li key={a.key} className="flex items-center gap-3 py-3">
                  {a.image ? (
                    <img
                      src={a.image}
                      alt={a.name}
                      className="h-14 w-14 shrink-0 rounded-xl border bg-muted object-cover"
                    />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-xl border bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug">
                      {a.name}
                      {a.variantLabel ? (
                        <span className="text-muted-foreground"> · {a.variantLabel}</span>
                      ) : null}
                    </p>
                    {removed ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                        Sin stock · eliminado del carrito
                      </p>
                    ) : (
                      <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-amber-700">
                        <PencilLine className="h-3.5 w-3.5" />
                        Cantidad ajustada: {a.previousQuantity} → {a.newQuantity}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {cop.format(a.unitPrice)} c/u
                      {a.newQuantity > 0 ? (
                        <>
                          {" "}· {a.newQuantity} × {cop.format(a.unitPrice)} = {cop.format(a.newQuantity * a.unitPrice)}
                        </>
                      ) : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t p-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Entendido, seguir con la confirmación
          </button>
        </div>
      </div>
    </div>
  );
}
