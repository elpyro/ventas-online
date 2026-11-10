# Ventas Online

Proyecto completo: Web pública (Next.js), Backend (Firebase Cloud Functions), APK admin (Flutter).

## Estructura
- `web/` Next.js (App Router, Tailwind)
- `functions/` Firebase Cloud Functions (TypeScript)
- `admin/` Flutter (APK administrativo)
- `firebase.json`, `firestore.rules`, `storage.rules`

## Setup
1. Crear proyecto Firebase "ventas-online".
2. Configurar Phone Auth, Firestore, Storage.
3. Web: copiar `web/.env.local.example` a `web/.env.local` y completar.
4. Functions: configurar `WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM` (via `functions/.env` o firebase config).
5. Admin: agregar `android/app/google-services.json` descargado de Firebase Console. Asignar custom claim `admin: true` al usuario SuperAdmin.

## Desarrollo
- Web: `cd web && npm run dev`
- Functions: `cd functions && npm run build && firebase deploy --only functions`
- Admin: `cd admin && flutter build apk`

## Datos de prueba

El seed es idempotente y escribe `store_config/general`, `catalogs` y `products`.
Edita `functions/scripts/seed-data.mjs` para cambiar los datos.

- Emulador (sin credenciales):
  ```powershell
  $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
  npm --prefix functions run seed -- --project ventas-online-ec
  ```
- Producción (requiere ADC: `gcloud auth application-default login`):
  ```powershell
  npm --prefix functions run seed -- --project ventas-online-ec
  ```

## Emuladores y webhook

El emulador de Firestore necesita Java. El JDK que trae Android Studio sirve:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
firebase emulators:start --config firebase.emulators.json --only "functions,firestore" --project ventas-online-ec
```

En otra terminal:

```powershell
$env:WEBHOOK_URL = "http://127.0.0.1:5001/ventas-online-ec/us-central1/webhookSku"
$env:WEBHOOK_SECRET = "dev-secret"
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:FIREBASE_PROJECT = "ventas-online-ec"
npm --prefix functions run webhook:test
```

La web corre con `cd web && npm run dev` y usa Firestore de producción.
Si el CLI no apunta al proyecto correcto, ejecutar `firebase use ventas-online-ec`.
