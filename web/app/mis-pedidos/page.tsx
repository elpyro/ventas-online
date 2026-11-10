import type { Metadata } from "next";
import MisPedidosClient from "./mis-pedidos-client";

export const metadata: Metadata = {
  title: "Mis pedidos",
  description:
    "Consulta los pedidos realizados con tu teléfono o inicia sesión para ver tu historial completo.",
  alternates: { canonical: "/mis-pedidos" },
  robots: { index: false, follow: false },
};

export default function MisPedidosPage() {
  return <MisPedidosClient />;
}
