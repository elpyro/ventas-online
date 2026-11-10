import type { Metadata } from "next";
import LoginClient from "./login-client";

export const metadata: Metadata = {
  title: "Ingresar",
  description:
    "Inicia sesión con tu teléfono para consultar tus pedidos y descargar sus comprobantes.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <LoginClient />;
}
