import type { Metadata } from "next";
import CheckoutClient from "./checkout-client";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Completa tus datos y confirma tu pedido mayorista. Coordinamos la entrega y el pago por WhatsApp.",
  alternates: { canonical: "/checkout" },
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutClient />;
}
