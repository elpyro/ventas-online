# Functions — instrucciones

Aplican solo a `functions/`. Se combinan con el `AGENTS.md` de la raíz.

## Comandos

```powershell
npm --prefix functions run build
npm --prefix functions run seed -- --project ventas-online-ec
npm --prefix functions run webhook:test
npm --prefix functions run logs
firebase deploy --only functions --project ventas-online-ec
```

Emuladores (desde la raíz):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
firebase emulators:start --config firebase.emulators.json --only "functions,firestore,storage" --project ventas-online-ec
```

## Estructura

- `src/index.ts`: `webhookSku`, `createOrder`, `getOrderDetails`, `getOrderPdfUrl`, `onOrderCreated` y `buildOrderPdf`.
- `scripts/seed-data.mjs`: datos demo editables.
- `scripts/seed.mjs`: seed idempotente.
- `scripts/test-webhook.mjs`: prueba 401 / 400 / 200 y actualización parcial.
- `lib/`: salida de TypeScript compilado; no editar a mano.

## Variables de entorno

```text
WEBHOOK_SECRET   obligatorio; el webhook responde 401 sin él
RESEND_API_KEY   opcional; sin ella no hay correos
RESEND_FROM      remitente verificado en Resend
```

- Nunca commitear `functions/.env`, `functions/.env.local` ni credenciales.
- `.env.local` sólo para el emulador.

## Reglas de código

- TypeScript estricto; sin `any`.
- Validar toda entrada externa; responder `400` con mensaje genérico.
- Usar `logger`, no `console.log`.
- Errores de servicios (Resend, FCM) se capturan; no tumban el pedido.
- Región `us-central1`.
- PDFs privados: `getOrderPdfUrl` firma URL previa verificación de `token.phone_number` o rol `admin`.
- `getOrderDetails` responde el MISMO error para
  "pedido inexistente" y "teléfono no coincide".

## Deuda técnica

- No hay tests automatizados de Functions (reglas de Firestore incluidas).
- `/catalogo/[id]` es client-side (no ideal para SEO).
- Fallback `addDoc` en checkout debe eliminarse tras desplegar `createOrder`.
- Cursor de competencia: rate limiting para `getOrderDetails` aún ausente.

## Verificación antes de desplegar

```powershell
npm --prefix functions run build
firebase emulators:start --config firebase.emulators.json --only "functions,firestore,storage" --project ventas-online-ec
```

En otra terminal:

```powershell
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
npm --prefix functions run seed -- --project ventas-online-ec
$env:WEBHOOK_URL = "http://127.0.0.1:5001/ventas-online-ec/us-central1/webhookSku"
$env:WEBHOOK_SECRET = "dev-secret"
$env:FIREBASE_PROJECT = "ventas-online-ec"
npm --prefix functions run webhook:test
```
