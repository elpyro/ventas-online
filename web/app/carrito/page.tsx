import type { Metadata } from "next";
import { getStoreConfig, getCatalogs } from "@/lib/serverData";
import CartView, { type CarritoCatalog } from "./cart-view";

export const metadata: Metadata = {
  title: "Carrito",
  description:
    "Revisa tus productos, cantidades y monto mínimo para confirmar tu pedido mayorista.",
  alternates: { canonical: "/carrito" },
  robots: { index: false, follow: false },
};

export default async function CarritoPage() {
  const [config, catalogs] = await Promise.all([getStoreConfig(), getCatalogs()]);

  const globalMinOrder = Number(config?.globalMinOrder ?? 0);
  const activeCatalogs: CarritoCatalog[] = (catalogs ?? [])
    .filter((c: any) => c?.isActive !== false)
    .map((c: any) => ({
      id: String(c.id),
      title: String(c.title ?? c.id),
      minOrderSubtotal: Number(c.minOrderSubtotal ?? 0),
    }));

  return <CartView globalMinOrder={globalMinOrder} catalogs={activeCatalogs} />;
}
