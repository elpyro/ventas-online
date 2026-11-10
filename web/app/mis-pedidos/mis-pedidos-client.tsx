"use client";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useCustomer } from "@/lib/customer";
import { db, functions } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { statusLabel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Package,
  ArrowRight,
  CircleAlert,
  Trash2,
  ChevronDown,
  X,
} from "lucide-react";

type OrderSummary = {
  orderId: string;
  status: string;
  total: number;
  itemCount: number;
  createdAt: string | null;
};

type OrderDetails = {
  orderId: string;
  customerName: string;
  deliveryAddress: string;
  status: string;
  total: number;
  itemCount: number;
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    variantLabel?: string; }>;
  createdAt: string | null;
};

export default function MisPedidosClient() {
  const { user, loading: authLoading } = useAuth();
  const { customer: savedCustomer, clearCustomer } = useCustomer();
  const router = useRouter();

  // Vista autenticada (SMS): perfil + historial.
  const [form, setForm] = useState({ name: "", email: "", address: "" });
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);

  // Vista invitado (teléfono guardado): lista automática sin ID.
  const [guestOrders, setGuestOrders] = useState<OrderSummary[] | null>(null);
  const [guestListError, setGuestListError] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [found, setFound] = useState<OrderDetails | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState("");

  const [pdfError, setPdfError] = useState("");
  const [pdfLoading, setPdfLoading] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (user) {
      (async () => {
        const phone = user.phoneNumber ?? "";
        const cSnap = await getDoc(doc(db, "customers", phone));
        if (cSnap.exists()) {
          const d = cSnap.data();
          setProfile(d);
          setForm({ name: d.name, email: d.email, address: d.address });
        }
        const q = query(
          collection(db, "orders"),
          where("customerPhone", "==", phone)
        );
        const snap = await getDocs(q);
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })();
      return;
    }

    if (savedCustomer) {
      // Sin sesión: listamos todos los pedidos del teléfono guardado.
      (async () => {
        try {
          const getOrdersByPhone = httpsCallable<
            { customerPhone: string },
            { orders: OrderSummary[] }
          >(functions, "getOrdersByPhone");
          const response = await getOrdersByPhone({
            customerPhone: savedCustomer.phone,
          });
          setGuestOrders(response.data.orders ?? []);
        } catch (e: any) {
          setGuestListError(
            e?.message ?? "No se pudieron cargar tus pedidos."
          );
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    setLoading(false);
  }, [user, authLoading, savedCustomer]);

  async function saveProfile() {
    if (!user?.phoneNumber) return;
    await setDoc(doc(db, "customers", user.phoneNumber), {
      phone: user.phoneNumber,
      name: form.name,
      email: form.email,
      address: form.address,
      createdAt: serverTimestamp(),
    });
    setProfile({ phone: user.phoneNumber, ...form });
  }

  async function openPdf(orderId: string) {
    setPdfError("");
    setPdfLoading(orderId);
    try {
      const getUrl = httpsCallable<{ orderId: string }, { url: string }>(
        functions,
        "getOrderPdfUrl"
      );
      const response = await getUrl({ orderId });
      window.open(response.data.url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setPdfError(e?.message ?? "No se pudo abrir el PDF.");
    } finally {
      setPdfLoading("");
    }
  }

  async function consultOrder(orderId: string) {
    if (!savedCustomer) return;
    setDetailError("");
    setDetailBusy(true);
    setDetailLoadingId(orderId);
    setFound(null);
    try {
      const getOrderDetails = httpsCallable<
        { orderId: string; customerPhone: string },
        OrderDetails
      >(functions, "getOrderDetails");
      const response = await getOrderDetails({
        orderId,
        customerPhone: savedCustomer.phone,
      });
      setFound(response.data);
    } catch (e: any) {
      setDetailError(
        e?.message === "functions/not-found"
          ? "No encontramos ese pedido con tu teléfono."
          : e?.message ?? "No se pudo consultar el pedido."
      );
    } finally {
      setDetailBusy(false);
      setDetailLoadingId("");
    }
  }

  async function lookupOrder(e: FormEvent) {
    e.preventDefault();
    const id = lookupId.trim();
    if (!id) return;
    await consultOrder(id);
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl items-center justify-center gap-3 px-4 py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        Cargando…
      </div>
    );
  }

  // ------------------------------------------------------------------
  // 1) Usuario autenticado con SMS: perfil + historial completo.
  // ------------------------------------------------------------------
  if (user) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Mis Pedidos</h1>
        {pdfError && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <CircleAlert className="h-5 w-5 shrink-0" />
            {pdfError}
          </div>
        )}
        {!profile && (
          <div className="mb-6 rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Completa tu perfil</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Estos datos se usarán para tus próximas entregas.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border px-3 py-2" />
              <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-lg border px-3 py-2" />
              <input placeholder="Dirección" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-lg border px-3 py-2" />
            </div>
            <Button className="mt-4" onClick={saveProfile}>Guardar</Button>
          </div>
        )}
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <p className="font-semibold">Pedido #{o.id}</p>
              <p className="text-sm text-muted-foreground">{statusLabel(o.status)} · ${o.total}</p>
              {o.pdfPath && (
                <button
                  onClick={() => openPdf(o.id)}
                  disabled={pdfLoading === o.id}
                  className="mt-1 text-sm font-medium text-blue-600 disabled:text-gray-400"
                >
                  {pdfLoading === o.id ? "Generando enlace…" : "Ver PDF"}
                </button>
              )}
            </div>
          ))}
          {orders.length === 0 && (
            <p className="text-muted-foreground">No tienes pedidos aún.</p>
          )}
        </div>
      </main>
    );
  }

  // ------------------------------------------------------------------
  // 2) Cliente sin sesión: listado automático por teléfono guardado.
  // ------------------------------------------------------------------
  if (savedCustomer) {
    const list = guestOrders ?? [];

    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Mis Pedidos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Hola, {savedCustomer.name} ({savedCustomer.phone})
            </p>
          </div>
          <button
            onClick={clearCustomer}
            title="Borrar mis datos de este navegador"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-red-200 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
            Borrar mis datos
          </button>
        </div>

        {guestListError && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <CircleAlert className="h-5 w-5 shrink-0" />
            {guestListError}
          </div>
        )}

        {guestOrders === null && !guestListError ? (
          <div className="mt-8 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p>Consultando tus pedidos…</p>
          </div>
        ) : list.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border bg-white p-10 text-center shadow-sm">
            <div className="rounded-full bg-muted p-4">
              <Package className="h-9 w-9 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold">Aún no hay pedidos</h2>
            <p className="text-sm text-muted-foreground">
              Cuando compres, tu pedido aparecerá aquí automáticamente con tu teléfono.
            </p>
            <Button onClick={() => router.push("/catalogos")}>
              Ir a la tienda
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <ul className="mt-6 space-y-3">
              {list.map((order) => (
                <li key={order.orderId} className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">
                        Pedido #{order.orderId}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {order.createdAt
                          ? new Date(order.createdAt).toLocaleDateString("es-CO", {
                              day: "2-digit",
                              month: "long",
                              year: "numeric",
                            })
                          : "Fecha pendiente"}{" "}
                        · {order.itemCount}{" "}
                        {order.itemCount === 1 ? "ítem" : "ítems"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">${order.total.toFixed(2)}</p>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        {statusLabel(order.status)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={detailBusy && detailLoadingId === order.orderId}
                    onClick={() => consultOrder(order.orderId)}
                  >
                    {detailBusy && detailLoadingId === order.orderId ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando…
                      </>
                    ) : (
                      <>
                        Ver detalle
                        <ChevronDown className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </li>
              ))}
            </ul>

            {detailError && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <CircleAlert className="h-5 w-5 shrink-0" />
                {detailError}
              </div>
            )}

            {found && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Detalle del pedido"
                className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
                onClick={() => setFound(null)}
              >
                <div
                  className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Detalle del pedido
                      </p>
                      <p className="break-all font-mono text-sm font-semibold">
                        {found.orderId}
                      </p>
                    </div>
                    <button
                      onClick={() => setFound(null)}
                      aria-label="Cerrar detalle"
                      className="rounded-lg border p-2 transition-colors hover:bg-muted"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="divide-y border-t text-sm">
                    {found.items.map((it) => (
                      <div key={it.sku} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{it.name}</p>
                          {it.variantLabel && (
                            <p className="text-xs font-medium text-primary">
                              {it.variantLabel}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {it.sku} · ${it.unitPrice.toFixed(2)} c/u
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">x{it.quantity}</p>
                          <p className="font-semibold">${it.subtotal.toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="text-muted-foreground">Total</span>
                    <span className="text-2xl font-extrabold">${found.total.toFixed(2)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Entrega en: {found.deliveryAddress}
                  </p>
                </div>
              </div>
            )}

            <details className="mt-6 rounded-2xl border bg-white p-4 text-sm text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                ¿No ves un pedido? Consultar por número
              </summary>
              <form onSubmit={lookupOrder} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  placeholder="Número de pedido"
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                  className="flex-1 rounded-lg border px-3 py-2 font-mono"
                />
                <Button type="submit" disabled={detailBusy}>
                  Consultar
                </Button>
              </form>
            </details>
          </>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          ¿Quieres ver todo tu historial y descargar PDFs?{" "}
          <Link href="/login" className="font-medium text-blue-600 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </main>
    );
  }

  // ------------------------------------------------------------------
  // 3) Sin datos en este navegador.
  // ------------------------------------------------------------------
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="mx-auto flex flex-col items-center gap-4 rounded-2xl border bg-white p-10 shadow-sm">
        <div className="rounded-full bg-muted p-4">
          <Package className="h-9 w-9 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">Todavía no hay compras</h1>
        <p className="text-sm text-muted-foreground">
          Cuando compres, tu pedido aparecerá aquí automáticamente con tu teléfono.
        </p>
        <Button size="lg" onClick={() => router.push("/catalogos")}>
          Ir a la tienda
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </main>
  );
}

