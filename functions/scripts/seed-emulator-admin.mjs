// Siembra en el EMULADOR un usuario admin de prueba y 4 pedidos de ejemplo
// (pendiente / en preparación / enviado / cancelado). NO toca producción:
// aborta si no detecta las variables de emulador.
//
// Uso:
//   $env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
//   $env:FIRESTORE_EMULATOR_HOST     = "127.0.0.1:8080"
//   node scripts/seed-emulator-admin.mjs
//
// Credenciales de prueba (solo emulador): admin@ventas.test / admin1234

import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT ?? "ventas-online-ec";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;

if (!authHost || !firestoreHost) {
  console.error("Abortado: faltan FIREBASE_AUTH_EMULATOR_HOST y/o FIRESTORE_EMULATOR_HOST.");
  console.error("Este script solo debe correr contra los emuladores locales.");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ projectId });
}
const auth = getAuth();
const db = getFirestore();

// ---------------------------------------------------------------- Usuario admin
const ADMIN_EMAIL = "admin@ventas.test";
const ADMIN_PASSWORD = "admin1234";

let user;
try {
  user = await auth.getUserByEmail(ADMIN_EMAIL);
  await auth.updateUser(user.uid, { password: ADMIN_PASSWORD });
} catch {
  user = await auth.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    emailVerified: true,
    displayName: "Admin de prueba",
  });
}
await auth.setCustomUserClaims(user.uid, { admin: true });
console.log(`OK: admin de prueba ${ADMIN_EMAIL} (uid ${user.uid}) con claim admin: true`);

// ---------------------------------------------------------------- Pedidos de ejemplo
const now = Date.now();
const stamps = [
  Timestamp.fromMillis(now - 1000 * 60 * 25),       // hace 25 min
  Timestamp.fromMillis(now - 1000 * 60 * 60 * 3),   // hace 3 h
  Timestamp.fromMillis(now - 1000 * 60 * 60 * 26),  // hace 26 h
  Timestamp.fromMillis(now - 1000 * 60 * 60 * 24 * 4), // hace 4 días
];

const itemsSets = [
  [
    { sku: "SKU-001", name: "Juego de ollas 5 piezas", catalogId: "hogar", unitPrice: 45.9, quantity: 1, subtotal: 45.9 },
    { sku: "SKU-005", name: "Lámpara LED de escritorio", catalogId: "hogar", unitPrice: 12.75, quantity: 2, subtotal: 25.5, variantId: "blanco-o-u", variantLabel: "Blanco / Única" },
  ],
  [
    { sku: "SKU-003", name: "Audífonos Bluetooth", catalogId: "tecnologia", unitPrice: 29.99, quantity: 1, subtotal: 29.99, variantId: "negro-m", variantLabel: "Negro / M" },
    { sku: "SKU-001", name: "Juego de ollas 5 piezas", catalogId: "hogar", unitPrice: 45.9, quantity: 1, subtotal: 45.9 },
  ],
  [
    { sku: "SKU-002", name: "Organizador de cocina", catalogId: "hogar", unitPrice: 18.5, quantity: 2, subtotal: 37 },
  ],
  [
    { sku: "SKU-005", name: "Lámpara LED de escritorio", catalogId: "hogar", unitPrice: 12.75, quantity: 1, subtotal: 12.75, variantId: "negro-o-u", variantLabel: "Negro / Única" },
  ],
];

const customers = [
  { customerName: "María Demo", customerPhone: "+573001234501", customerEmail: "maria@ejemplo.test", deliveryAddress: "Calle 72 #10-34, Bogotá" },
  { customerName: "Juan Prueba", customerPhone: "+573001234502", customerEmail: "juan@ejemplo.test", deliveryAddress: "Carrera 15 #85-20, Bogotá" },
  { customerName: "Ana Test", customerPhone: "+573001234503", customerEmail: "ana@ejemplo.test", deliveryAddress: "Cl. 100 #11-60, Bogotá" },
  { customerName: "Pedro Demo", customerPhone: "+573001234504", customerEmail: "pedro@ejemplo.test", deliveryAddress: "Av. Caracas #45-10, Bogotá" },
];

const statuses = ["pending", "preparing", "dispatched", "cancelled"];
const ids = ["demo-order-pending", "demo-order-preparing", "demo-order-dispatched", "demo-order-cancelled"];

for (let i = 0; i < statuses.length; i++) {
  const items = itemsSets[i];
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  await db.collection("orders").doc(ids[i]).set({
    ...customers[i],
    items,
    total: Math.round(total * 100) / 100,
    status: statuses[i],
    source: "web",
    createdAt: stamps[i],
  });
  console.log(`OK: pedido ${ids[i]} (${statuses[i]}) $${total.toFixed(2)}`);
}

console.log("Listo. Credenciales del emulador: admin@ventas.test / admin1234");
