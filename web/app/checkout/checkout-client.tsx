"use client";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useCustomer, normalizePhone } from "@/lib/customer";
import { db, functions } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MinimumOrderHint } from "@/components/minimum-order-hint";
import { buildMinimumLines } from "@/components/cart-drawer";
import { toast } from "@/hooks/use-toast";
import { CheckoutAdjustDialog, type CheckoutAdjustment } from "@/components/checkout-adjust-dialog";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  MessageCircle,
  PackageCheck,
  ShoppingBasket,
  ArrowRight,
} from "lucide-react";

/** Precios en pesos colombianos (es-CO, COP). */
const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 2,
});

type CreateOrderResult = {
  orderId: string;
  total: number;
  itemCount: number;
};

type DoneOrder = {
  orderId: string;
  total: number;
  itemCount: number;
  whatsappUrl: string;
};

export default function CheckoutPage() {
  const { items, total, clear, updateQty, removeItem } = useCart();
  const { user } = useAuth();
  const { customer: savedCustomer, saveCustomer } = useCustomer();
  const router = useRouter();

  const [config, setConfig] = useState<any>(null);
  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // true cuando el error es de inventario: se muestra el mensaje del servidor
  // y el botón para ajustar el carrito antes de confirmar otra vez.
  const [stockError, setStockError] = useState(false);
  const [done, setDone] = useState<DoneOrder | null>(null);
  // null = el cuadro está cerrado; array = muestra los ajustes aplicados.
  const [adjustments, setAdjustments] = useState<CheckoutAdjustment[] | null>(null);

  // Precarga datos guardados en este navegador (compras anteriores).
  useEffect(() => {
    if (!savedCustomer) return;
    setCustomer((prev) => ({
      name: prev.name || savedCustomer.name,
      email: prev.email || savedCustomer.email,
      phone: prev.phone || savedCustomer.phone,
      address: prev.address || savedCustomer.address,
    }));
  }, [savedCustomer]);

  useEffect(() => {
    (async () => {
      const cSnap = await getDoc(doc(db, "store_config", "general"));
      setConfig(cSnap.exists() ? cSnap.data() : null);
      // load catalogs referenced
      const ids = Array.from(new Set(items.map((i) => i.catalogId)));
      const cats: any[] = [];
      for (const id of ids) {
        const s = await getDoc(doc(db, "catalogs", id));
        if (s.exists()) cats.push({ id, ...s.data() });
      }
      setCatalogs(cats);

      // Si el usuario inició sesión con SMS, sus datos de perfil tienen prioridad.
      if (user?.phoneNumber) {
        const custSnap = await getDoc(doc(db, "customers", user.phoneNumber));
        if (custSnap.exists()) {
          const d = custSnap.data();
          setCustomer((prev) => ({
            ...prev,
            name: d.name ?? prev.name,
            email: d.email ?? prev.email,
            phone: user.phoneNumber ?? prev.phone,
            address: d.address ?? prev.address,
          }));
        } else {
          setCustomer((prev) => ({ ...prev, phone: user.phoneNumber ?? prev.phone }));
        }
      }
      setLoading(false);
    })();
  }, [user, items]);

  function validate(): string | null {
    if (!config) return "Config no disponible";
    if (items.length === 0) return "Tu carrito está vacío.";
    // Carritos viejos guardados sin catalogId: el servidor los rechaza.
    if (items.some((i) => !i.catalogId)) {
      return "Hay productos sin catálogo en tu carrito. Vuelve a agregarlos desde un catálogo.";
    }
    if (total < (config.globalMinOrder ?? 0)) {
      return `Compra mínima global: ${cop.format(Number(config.globalMinOrder ?? 0))}. Total actual: ${cop.format(total)}`;
    }
    // per catalog
    const byCatalog: Record<string, number> = {};
    for (const i of items) {
      byCatalog[i.catalogId] = (byCatalog[i.catalogId] ?? 0) + i.price * i.quantity;
    }
    for (const [cid, sub] of Object.entries(byCatalog)) {
      const cat = catalogs.find((c) => c.id === cid);
      if (cat && sub < (cat.minOrderSubtotal ?? 0)) {
        return `Catálogo ${cat.title}: compra mínima ${cop.format(Number(cat.minOrderSubtotal ?? 0))}. Subtotal actual ${cop.format(sub)}`;
      }
    }
    if (!customer.name || !customer.email || !customer.address) {
      return "Completa nombre, email y dirección.";
    }
    if (customer.phone.replace(/\D/g, "").length < 7) {
      return "Ingresa un teléfono válido.";
    }
    return null;
  }

  async function handleConfirm() {
    setError("");
    setStockError(false);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customer,
        items: items.map((i) => ({
          sku: i.sku,
          quantity: i.quantity,
          catalogId: i.catalogId,
          ...(i.variantId ? { variantId: i.variantId, variantLabel: i.variantLabel } : {}),
          ...(i.note ? { note: i.note } : {}),
        })),
      };

      let orderId = "";
      let orderTotal = total;
      let itemCount = items.length;

      const createOrder = httpsCallable<typeof payload, CreateOrderResult>(
        functions,
        "createOrder"
      );

      try {
        const response = await createOrder(payload);
        orderId = response.data.orderId;
        orderTotal = response.data.total;
        itemCount = response.data.itemCount;
      } catch (e: any) {
        // El servidor habla español y redacta para el cliente: no se muestran
        // códigos ni detalles internos cuando el mensaje es seguro.
        const serverMsg =
          typeof e?.data?.message === "string"
            ? e.data.message
            : typeof e?.message === "string"
              ? e.message
              : "";
        const isStockError = /stock|disponible|agotad/i.test(serverMsg);
        if (isStockError) {
          console.error("createOrder (stock)", e);
          setStockError(true);
          throw new Error(serverMsg);
        }
        console.error("createOrder failed", e);
        throw new Error("No se pudo crear el pedido. Intenta de nuevo en unos minutos.");
      }

      // Registra al cliente en este navegador para próximas compras.
      const phoneRaw = user?.phoneNumber ?? customer.phone;
      const savedPhone = normalizePhone(phoneRaw) || phoneRaw.trim();
      saveCustomer({
        name: customer.name.trim(),
        email: customer.email.trim(),
        phone: savedPhone,
        address: customer.address.trim(),
      });

      // Auto-inscripción en el contador de visitas: como el cliente acaba de
      // comprar, se guarda su nombre en el historial de hoy para que el APK
      // lo vea como "registrado" desde el mismo día (aunque su visita de hoy
      // se contó como anónimo).
      const today = new Date().toISOString().slice(0, 10);
      const customerId = savedPhone.replace(/\//g, "_").trim();
      if (customerId) {
        setDoc(
          doc(db, "metrics", "visits", "history", today, "customers", customerId),
          { name: customer.name.trim(), phone: customerId, at: Timestamp.fromDate(new Date()) },
          { merge: true }
        ).catch(() => {
          // Sin permiso o sin red: el pedido igual se creó.
        });
      }

      const waPhone = (config?.phoneContact ?? "").replace(/\D/g, "");
      const text = encodeURIComponent("Hola, acabo de hacer un pedido");
      clear();

      toast({
        title: "Compra registrada",
        description: "Tus datos quedaron guardados en este navegador.",
        variant: "success",
      });

      setDone({
        orderId,
        total: orderTotal,
        itemCount,
        whatsappUrl: `https://wa.me/${waPhone}?text=${text}`,
      });
    } catch (e: any) {
      // No tocamos setStockError aquí: si el fallo fue de inventario,
      // la rama de createOrder marcó stockError y el botón debe quedar visible.
      setError(e?.message ?? "Error al crear pedido");
    } finally {
      setSubmitting(false);
    }
  }

  // Recalcula el carrito contra el stock REAL (productos públicos, lectura
  // anónima) y muestra un cuadro con todo lo que ajustamos o eliminamos.
  async function adjustToStock() {
    setSubmitting(true);
    try {
      const changes: CheckoutAdjustment[] = [];
      for (const line of items) {
        const snap = await getDoc(doc(db, "products", line.sku));
        let available = 0;
        if (snap.exists()) {
          const p = snap.data() as any;
          available = Number(p.stock ?? 0);
          if (line.variantId) {
            const match = Array.isArray(p.variants)
              ? p.variants.find((v: any) => v && v.id === line.variantId)
              : undefined;
            available = match ? Number(match.stock ?? 0) : 0;
          }
        }
        if (available > 0 && line.quantity > available) {
          updateQty(line.key, available);
          changes.push({
            key: line.key,
            sku: line.sku,
            name: line.name,
            image: line.image,
            variantLabel: line.variantLabel,
            unitPrice: line.price,
            previousQuantity: line.quantity,
            newQuantity: available,
          });
        } else if (available <= 0) {
          removeItem(line.key);
          changes.push({
            key: line.key,
            sku: line.sku,
            name: line.name,
            image: line.image,
            variantLabel: line.variantLabel,
            unitPrice: line.price,
            previousQuantity: line.quantity,
            newQuantity: 0,
          });
        }
      }
      setStockError(false);
      if (changes.length > 0) {
        setError("");
        setAdjustments(changes);
      } else {
        setError(
          "No pudimos ajustar nada: revisa que tus productos sigan existiendo en el catálogo."
        );
      }
    } catch {
      setError("No se pudo verificar el stock. Revisa la conexión e intenta de nuevo.");
      setStockError(false);
    } finally {
      setSubmitting(false);
    }
  }

  // Pantalla de éxito tras crear el pedido.
  if (done) {
    return (
      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-14 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-11 w-11 text-emerald-600" />
        </div>
        <h1 className="mt-6 text-2xl font-bold">¡Pedido confirmado!</h1>
        <p className="mt-2 text-muted-foreground">
          Tu pedido quedó registrado. Un asesor se comunicará contigo por WhatsApp
          para coordinar la entrega y el pago.
        </p>

        <div className="mt-6 w-full rounded-2xl border bg-white p-5 text-left shadow-sm">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Número de pedido
          </p>
          <p data-testid="order-id" className="mt-1 break-all font-mono text-sm font-semibold">
            {done.orderId}
          </p>
          <div className="mt-4 flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">
              {done.itemCount} {done.itemCount === 1 ? "producto" : "productos"}
            </span>
            <span className="text-xl font-extrabold">{cop.format(done.total)}</span>
          </div>
        </div>

        <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-14 flex-1 text-base font-bold shadow-lg shadow-primary/30">
            <a href={done.whatsappUrl} target="_blank" rel="noreferrer" data-testid="whatsapp-confirm">
              <MessageCircle className="h-6 w-6" />
              Enviar por WhatsApp
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-14 flex-1 border-primary/40 text-base font-bold text-primary hover:bg-primary/5">
            <Link href="/mis-pedidos">
              Ver mis pedidos
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
        <button
          onClick={() => router.push("/catalogos")}
          className="mt-4 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary/10 px-6 text-base font-bold text-primary transition-colors hover:bg-primary/15 sm:w-auto"
        >
          Seguir comprando
          <ArrowRight className="h-5 w-5" />
        </button>
        <p className="mt-6 text-xs text-muted-foreground">
          Tus datos quedaron guardados en este navegador para tus próximas compras.
          Para borrarlos, cierra sesión arriba a la derecha.
        </p>
      </main>
    );
  }

  // Carrito vacío y sin pedido en curso.
  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto flex flex-col items-center gap-4 rounded-2xl border bg-white p-10 shadow-sm">
          <ShoppingBasket className="h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-bold">No hay productos en tu carrito</h1>
          <p className="text-sm text-muted-foreground">
            Agrega productos antes de confirmar el pedido.
          </p>
          <Button onClick={() => router.push("/catalogos")}>
            Ir a catálogos
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 px-4 py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        Cargando confirmación…
      </div>
    );
  }

  const minLines = config
    ? buildMinimumLines(
        items,
        Number(config.globalMinOrder ?? 0),
        catalogs.map((c) => ({
          id: String(c.id),
          title: String(c.title ?? c.id),
          minOrderSubtotal: Number(c.minOrderSubtotal ?? 0),
        }))
      )
    : [];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center gap-2">
        <PackageCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Confirmación</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Completa tus datos. Al confirmar, guardamos tu pedido en esta tienda.
      </p>

      {savedCustomer && (
        <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Usando tus datos guardados de una compra anterior. Puedes editarlos.
        </div>
      )}
      {error && (
        <div className="mt-4 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="flex items-center gap-2">
            <CircleAlert className="h-5 w-5 shrink-0" />
            {error}
          </div>
          {stockError && (
            <>
              <p className="pl-7 text-xs">
                Ese producto ya no tiene suficiente stock. Puedes ajustar el
                carrito al stock real y confirmar de nuevo.
              </p>
              <button
                type="button"
                onClick={adjustToStock}
                disabled={submitting}
                className="ml-7 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {submitting ? "Verificando disponibilidad…" : "Ajustar carrito al stock disponible"}
              </button>
            </>
          )}
        </div>
      )}

      <div className="mt-5 space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <input
            placeholder="Nombre"
            value={customer.name}
            onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 outline-none transition-shadow focus:ring-2 focus:ring-primary"
          />
          <input
            placeholder="Email"
            type="email"
            value={customer.email}
            onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 outline-none transition-shadow focus:ring-2 focus:ring-primary"
          />
        </div>
        <input
          placeholder="Teléfono (WhatsApp)"
          inputMode="tel"
          value={customer.phone}
          onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
          className="w-full rounded-lg border px-3 py-2 outline-none transition-shadow focus:ring-2 focus:ring-primary"
        />
        <input
          placeholder="Dirección de entrega"
          value={customer.address}
          onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
          className="w-full rounded-lg border px-3 py-2 outline-none transition-shadow focus:ring-2 focus:ring-primary"
        />

        <p className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <MessageCircle className="h-4 w-4 shrink-0 mt-0.5" />
          Al confirmar, un asesor se comunicará contigo por WhatsApp para coordinar entrega y pago.
        </p>

        <MinimumOrderHint lines={minLines} />

        <div className="flex items-center justify-between border-t pt-4">
          <span className="text-muted-foreground">Total</span>
          <span className="text-2xl font-extrabold">{cop.format(total)}</span>
        </div>
        <Button
          size="lg"
          className="w-full"
          onClick={handleConfirm}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Creando pedido…
            </>
          ) : (
            "Confirmar pedido"
          )}
        </Button>
        {!user && (
          <p className="text-xs text-muted-foreground">
            Sin cuenta: tu teléfono queda vinculado a este equipo y puedes ver el pedido
            en &quot;Mis pedidos&quot;. También puedes{" "}
            <Link href="/login" className="font-medium text-blue-600 hover:underline">
              iniciar sesión
            </Link>{" "}
            para ver todo tu historial.
          </p>
        )}
      </div>

      {adjustments && (
        <CheckoutAdjustDialog
          adjustments={adjustments}
          onClose={() => setAdjustments(null)}
        />
      )}
    </main>
  );
}
