// Backfill de métricas de CRM para `customers/{phone}`.
//
// Recorre `orders` (excluyendo los borradores "selecting") y actualiza cada
// ficha de cliente con: firstOrderAt, lastOrderAt, orderCount, totalSpent,
// avgTicket, status (active). Crea la ficha si no existe, tomando nombre/
// email/dirección del pedido más reciente.
//
// Uso:
//   node scripts/backfill-customers.mjs --project ventas-online-ec
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/backfill-customers.mjs --project ventas-online-ec
//
// No borra campos existentes (merge). Es idempotente: recalcular no duplica.

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const projectId =
  getArg("--project") ?? process.env.SEED_PROJECT ?? "ventas-online-ec";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

const app = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);

async function main() {
  const target = emulatorHost ? `emulador (${emulatorHost})` : "producción";
  console.log(`Backfill de clientes en ${target} (${projectId})...`);

  const snap = await db.collection("orders").get();
  const orders = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((o) => String(o.status ?? "") !== "selecting");

  console.log(`Pedidos a procesar: ${orders.length}`);

  // Agrupar por teléfono.
  const byPhone = new Map();
  for (const o of orders) {
    const phone = String(o.customerPhone ?? "").trim();
    if (!phone) continue;
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push(o);
  }

  let updated = 0;
  for (const [phone, list] of byPhone) {
    list.sort((a, b) => {
      const ta = a.createdAt?.toDate?.() ?? new Date(0);
      const tb = b.createdAt?.toDate?.() ?? new Date(0);
      return ta.getTime() - tb.getTime();
    });
    const first = list[0];
    const last = list[list.length - 1];
    const orderCount = list.length;
    const totalSpent = list.reduce(
      (acc, o) => acc + (Number(o.total) || 0),
      0
    );
    const avgTicket = orderCount > 0 ? totalSpent / orderCount : 0;

    const ref = db.doc(`customers/${phone}`);
    const existing = await ref.get();
    const data = existing.exists ? existing.data() ?? {} : {};

    const payload = {
      phone,
      name:
        String(last.customerName ?? "").trim() ||
        String(data.name ?? "").trim() ||
        "",
      email:
        String(last.customerEmail ?? "").trim() ||
        String(data.email ?? "").trim() ||
        "",
      address:
        String(last.deliveryAddress ?? "").trim() ||
        String(data.address ?? "").trim() ||
        "",
      firstOrderAt: first.createdAt ?? FieldValue.serverTimestamp(),
      lastOrderAt: last.createdAt ?? FieldValue.serverTimestamp(),
      orderCount,
      totalSpent: Math.round(totalSpent * 100) / 100,
      avgTicket: Math.round(avgTicket * 100) / 100,
      status: typeof data.status === "string" ? data.status : "active",
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!existing.exists) {
      payload.createdAt = last.createdAt ?? FieldValue.serverTimestamp();
      payload.tags = Array.isArray(data.tags) ? data.tags : [];
      payload.notes = Array.isArray(data.notes) ? data.notes : [];
    }

    await ref.set(payload, { merge: true });
    updated++;
  }

  console.log(`OK: ${updated} cliente(s) actualizados/creados.`);
  console.log(`Teléfonos: ${[...byPhone.keys()].join(", ") || "(ninguno)"}`);
}

main().catch((error) => {
  console.error("Error en backfill:", error);
  process.exitCode = 1;
});
