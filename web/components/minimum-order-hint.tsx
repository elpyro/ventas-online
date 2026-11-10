import { CheckCircle2, CircleAlert } from "lucide-react";

export interface MinimumLine {
  label: string;
  current: number;
  min: number;
}

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});

/**
 * Muestra el progreso hacia los mínimos de compra (global y por catálogo).
 * Verde cuando todo está cubierto; ámbar con barra de progreso cuando falta.
 */
export function MinimumOrderHint({ lines }: { lines: MinimumLine[] }) {
  const relevant = lines.filter((l) => l.min > 0);
  if (relevant.length === 0) return null;

  const missing = relevant.filter((l) => l.current < l.min);

  if (missing.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Pedido mínimo cumplido — puedes confirmar tu compra.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-900">
        <CircleAlert className="h-4 w-4 shrink-0" />
        Falta llegar al mínimo
      </p>
      {missing.map((line) => {
        const pct = Math.min(100, Math.round((line.current / line.min) * 100));
        const faltante = Math.max(0, line.min - line.current);
        return (
          <div key={line.label} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs text-amber-900">
              <span className="font-medium">{line.label}</span>
              <span>
                {cop.format(line.current)} de {cop.format(line.min)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-amber-200/70">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-amber-800">
              Te faltan {cop.format(faltante)} para completarlo.
            </p>
          </div>
        );
      })}
    </div>
  );
}
