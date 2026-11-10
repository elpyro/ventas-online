"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Package, UserRound } from "lucide-react";

import { useCustomer } from "@/lib/customer";
import { useCart } from "@/lib/cart";
import { toast } from "@/hooks/use-toast";

export function AccountMenu() {
  const router = useRouter();
  const { customer, loaded, clearCustomer } = useCustomer();
  const { clear: clearCart } = useCart();

  function logout() {
    clearCustomer();
    clearCart();
    toast({
      title: "Sesión cerrada",
      description: "Se borraron tus datos y el carrito de este navegador.",
      variant: "success",
    });
    router.push("/");
  }

  if (!loaded) {
    return <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />;
  }

  if (!customer) {
    return (
      <Link
        href="/login"
        aria-label="Ingresar"
        title="Ingresar"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
      >
        <UserRound className="h-5 w-5" />
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <div className="hidden text-right leading-tight lg:block">
        <p className="text-[11px] text-muted-foreground">Hola,</p>
        <p className="max-w-[120px] truncate text-sm font-semibold" title={customer.name}>
          {customer.name}
        </p>
      </div>
      <Link
        href="/mis-pedidos"
        aria-label="Mis pedidos"
        title="Mis pedidos"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
      >
        <Package className="h-5 w-5" />
      </Link>
      <button
        onClick={logout}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <LogOut className="h-5 w-5" />
      </button>
    </div>
  );
}
