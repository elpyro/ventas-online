# Ventas Online

Tienda mayorista con web pública, backend en Firebase y APK administrativo.
El usuario está aprendiendo a programar: explica los cambios en español,
con el porqué y ejemplos cortos, señalando archivos concretos.

## Stack y estructura

- `web/` — Next.js 15 (App Router), React 18, Tailwind, Firebase SDK 9. Usa Firestore de producción.
- `functions/` — Cloud Functions v2 en TypeScript, Node 22, `firebase-functions` 7.4.0.
- `admin/` — App Flutter (APK) para administración.
- Raíz: `firebase.json`, `firestore.rules`, `storage.rules`, `firebase.emulators.json`.

## Comandos

```powershell
cd web; npm run dev                 # web en http://localhost:3000
cd web; npm run build               # verificar build de la web
npm --prefix functions run build    # compilar TypeScript de Functions
firebase use ventas-online-ec       # fijar el proyecto correcto
firebase deploy --only firestore:rules
firebase deploy --only functions
npm --prefix functions run seed -- --project ventas-online-ec
npm --prefix functions run webhook:test
```

Emuladores (requieren Java; usar el JDK de Android Studio):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
firebase emulators:start --config firebase.emulators.json --only "functions,firestore" --project ventas-online-ec
```

## Arquitectura

- Colecciones: `store_config`, `catalogs`, `products`, `customers`, `orders`, `admin_tokens`.
- El ID de un producto es su SKU (`products/{sku}`).
- Un producto puede tener `variants` con `stock` y `price` propios; el servidor
  (`createOrder`) descuenta cada variante y recalcula el `stock` total.
- La ficha pública del producto vive en `/producto/[sku]`; el buscador es en memoria.
- `webhookSku` (HTTP) crea/actualiza productos; valida `x-webhook-secret`.
- `onOrderCreated` (trigger) genera PDF, envía correo con Resend y notifica por FCM.
- El checkout de la web crea pedidos desde el cliente: es una debilidad conocida.
- La web lee Firestore de producción; los emuladores son un entorno aparte.

## Convenciones

- TypeScript estricto; evitar `any` y casts innecesarios.
- UI y documentación en español.
- Nombres de Firestore en `camelCase`; IDs de catálogo en minúsculas sin espacios.
- Reutilizar `web/lib/serverData.ts` y `web/lib/firebase.ts`; no duplicar inicialización.
- Comentarios solo donde expliquen el porqué, no el qué.

## Seguridad

- Nunca commitear `functions/.env`, `functions/.env.local`, `web/.env.local` ni credenciales ADC.
- No ejecutar `seed`, `deploy` ni escrituras en producción sin confirmación explícita.
- `WEBHOOK_SECRET` es obligatorio; el webhook debe rechazar peticiones sin secreto (401).
- Los pedidos contienen datos personales: los PDFs no deben ser públicos (`makePublic` es deuda técnica).
- Escrituras de catálogo/producto/config solo para usuarios con claim `admin: true`.
- No inventar precios ni totales en el cliente; el servidor es la fuente de verdad (pendiente).

## Verificación antes de terminar

1. `npm --prefix functions run build` si se tocó `functions/`.
2. `cd web; npm run build` si se tocó `web/`.
3. `firebase emulators:exec --config firebase.emulators.json --only "functions,firestore" ...` para probar Functions.
4. `npm --prefix functions run webhook:test` si se tocó el webhook.
5. Resumir qué se cambió, qué se probó y qué quedó pendiente.

## Trampas conocidas

- El emulador de Firestore puede quedar con reglas viejas si lleva horas corriendo:
  un GET anónimo que debería ser público responde 403. Volver a guardar
  `firestore.rules` (aunque no cambie nada) fuerza la recarga en caliente sin
  perder los datos del emulador.
- El CLI puede heredar otro proyecto por un mapeo global: verificar con `firebase use --json`.
- En PowerShell, `--only "functions,firestore"` necesita comillas.
- Usar `firebase.emulators.json`: el `firebase.json` principal incluye Hosting y pide la experimentación `webframeworks`.
- El emulador de Firestore necesita Java; sin `JAVA_HOME` falla con `spawn java ENOENT`.
- `firebase-functions` 7.4.0 es necesario para que el emulador cargue las Functions; no bajarlo sin probar.
- El seed de producción requiere credenciales ADC; los emuladores no.
- No hay `predeploy`: compilar Functions a mano antes de desplegar.

## Documentación

- `docs/architecture.md`: flujos y deuda técnica.
- `docs/data-model.md`: colecciones, campos y reglas.
- `docs/runbook.md`: comandos de operación y problemas frecuentes.
