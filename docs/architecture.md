# Arquitectura — Ventas Online

Documento de referencia. No se carga automáticamente: se consulta cuando hace falta.
Las reglas del día a día están en `AGENTS.md` y el estado actual en `MEMORY.md`.

## Visión general

Tres clientes sobre un mismo backend Firebase:

1. **Web pública** (`web/`): Next.js 15 App Router. Vende y consulta pedidos.
2. **APK admin** (`admin/`): Flutter. Gestiona productos, catálogos, pedidos y configuración; recibe notificaciones.
3. **ERP externo**: llama al webhook HTTP para sincronizar productos.

Servicios: Firestore (datos), Storage (PDFs), Auth (teléfono, opcional), FCM (push),
Resend (correo).

## Componentes y responsabilidades

| Pieza | Archivo | Responsabilidad |
|---|---|---|
| Layout global | `web/app/layout.tsx` | Encabezado, pie y providers |
| Header | `web/components/site-header.tsx` | Marca, cuenta y carrito |
| Menú de cuenta | `web/components/account-menu.tsx` | Saludo, Mis pedidos, cerrar sesión |
| Encabezado de carrito | `web/components/cart-drawer.tsx` | Panel con cantidades y total |
| Pie | `web/components/site-footer.tsx` | Catálogos no visibles, contacto |
| Tarjeta de producto | `web/components/product-card.tsx` | Card reutilizable (relacionados, búsqueda) |
| Ficha de producto | `web/app/producto/[sku]/page.tsx` | Servidor: metadata + JSON-LD `Product` |
| Galería | `web/components/product-gallery.tsx` | Miniaturas, imagen principal y video |
| Compartir | `web/components/share-product-button.tsx` | Web Share API / copiar / WhatsApp |
| Buscador home | `web/components/home-search.tsx` | Búsqueda global en todos los catálogos |
| API de búsqueda | `web/app/api/search/route.ts` | Filtro en memoria (sin tildes) |
| Resultados | `web/app/buscar/page.tsx` | Grid de resultados (`noindex`) |
| Utilidad búsqueda | `web/lib/search.ts` | `normalizeSearch` + `matchesProduct` |
| UI | `web/components/ui/` | Botón, tarjeta, toast (shadcn/ui) |
| Cliente ligero | `web/lib/customer.tsx` | Perfil en navegador (`customerProfile`) |
| Inicio | `web/app/page.tsx` | Config, banners y catálogos |
| Listado | `web/app/catalogos/page.tsx` | Catálogos visibles |
| Detalle | `web/app/catalogo/[id]/page.tsx` | Productos del catálogo |
| Carrito | `web/lib/cart.tsx` | Estado del carrito |
| Login | `web/app/login/page.tsx` | Phone Auth **opcional** |
| Checkout | `web/app/checkout/page.tsx` | Compra como invitado → `createOrder` |
| Mis pedidos | `web/app/mis-pedidos/page.tsx` | Historial (SMS) o consulta (teléfono + ID) |
| Datos SSR | `web/lib/serverData.ts` | REST de Firestore / emulador |
| Webhook | `functions/src/index.ts` → `webhookSku` | Upsert de productos desde ERP |
| Crear pedido | `functions/src/index.ts` → `createOrder` | Transacción: valida, crea y descuenta (variantes incluidas) |
| Consulta pedido | `functions/src/index.ts` → `getOrderDetails` | Invitado: ID + teléfono |
| PDF | `functions/src/index.ts` → `buildOrderPdf` | PDF de pedido |
| PDF privado | `functions/src/index.ts` → `getOrderPdfUrl` | URL firmada de 15 minutos |
| Trigger | `functions/src/index.ts` → `onOrderCreated` | PDF, correo y push (idempotente) |

## Flujo 1 — Ver catálogo

1. `web/app/page.tsx` y `web/app/catalogos/page.tsx` llaman a
   `getStoreConfig()` / `getCatalogs()` con `revalidate: 60`.
2. `web/lib/serverData.ts` consulta la REST de producción o la REST del
   emulador cuando `NEXT_PUBLIC_USE_EMULATORS=true`.
3. Se muestran catálogos `isActive !== false` y `isVisible !== false`.
   Los ocultos por el admin aparecen en el pie.

## Flujo 1.1 — Ficha y búsqueda de productos

1. `/producto/[sku]` es un Server Component (`force-dynamic`):
   - HTML y metadata con `seoTitle`/`seoDescription` o fallbacks;
   - JSON-LD `Product` (marca, ofertas, disponibilidad, especificaciones como `PropertyValue`).
2. `product-detail-client.tsx` muestra galería (fotos + video), colores y tallas
   con **stock propio por variante**, cantidad con tope según stock y
   **un asesor se comunicará por WhatsApp**.
3. **Compartir**: `navigator.share` → copia de enlace → botón WhatsApp.
4. Al final, 4 productos del mismo catálogo (prioriza los disponibles).
5. Búsqueda:
   - en `/catalogo/[id]`, filtro instantáneo en cliente (`lib/search.ts`);
   - en la home, `HomeSearch` consulta `/api/search?q=` (debounce 200 ms);
   - `/buscar` lista resultados en servidor (`noindex, follow`);
   - el filtro es en memoria (sin tildes ni mayúsculas); para miles de
     productos convendría Algolia/Typesense.

## Flujo 2 — Carrito

1. `web/lib/cart.tsx` mantiene `items` en memoria y persiste en `localStorage` (`cart`).
2. `web/components/cart-drawer.tsx` muestra contador y botón flotante en el encabezado.
3. El panel permite ajustar cantidades, eliminar ítems, ver el total y
   cuánto falta para el mínimo global o por catálogo.
4. `/carrito` ofrece la misma gestión con más espacio.

## Flujo 3 — Identidad de cliente ligera (sin SMS)

1. Antes de comprar, no hace falta registrarse.
2. Al crear un pedido, `createOrder` usa el teléfono del formulario
   normalizado a `+<dígitos>`.
3. La web guarda `{name, email, phone, address}` en `localStorage` (`customerProfile`).
4. El encabezado saluda al cliente y ofrece **Mis pedidos**.
5. **Cerrar sesión** borra identidad y carrito del navegador.

## Flujo 4 — Historial y consulta de pedidos

- **Teléfono + ID de pedido** (`/mis-pedidos`): `getOrderDetails` responde
  igual para "no existe" y "teléfono no coincide"; no revela existencia de pedidos.
- **SMS opcional** (`/login`): historial completo y PDF firmado.

## Flujo 5 — Checkout

1. `web/app/checkout/page.tsx` carga `store_config/general`, mínimos y perfil
   (navegador o `customers/{phone}` si está autenticado).
2. `validate()` comprueba mínimo global, mínimos de catálogo y campos completos.
3. Se llama a `createOrder` vía `httpsCallable` con precios jamás confiados al cliente.
4. `createOrder`:
   - **fusiona líneas** por `sku::variantId` (el mismo producto con variantes distintas genera líneas separadas);
   - verifica existencia, disponibilidad, pertenencia a catálogo;
   - si el producto tiene variantes, **el stock y el precio salen de la variante**
     (`isAvailable = suma de stocks > 0` es la fuente de verdad del servidor);
   - aplica mínimos global/catálogo;
   - calcula total;
   - crea pedido y descuenta inventario **en la misma transacción**
     (reescribe el array `variants` y recalcula `stock` total);
   - actualiza `customers/{phone}` solo si el `phone_number` coincide en Auth.
5. Fallback temporal `addDoc` en el navegador si Functions aún no está desplegada
   (abre en producción). Debe eliminarse tras el despliegue.
6. Tras éxito se vacía el carrito y aparece la pantalla de éxito:
   - ID de pedido;
   - **Enviar por WhatsApp** (opcional);
   - **Ver mis pedidos** (teléfono + ID en la consulta).

## Flujo 6 — Pedido creado (`onOrderCreated`)

1. El trigger escucha `orders/{orderId}` en `us-central1` con flags:
   - `pdfPath` generado una sola vez;
   - `emailSentAt` = correo enviado una sola vez;
   - `pushSentAt` = push de admin enviado una sola vez.
2. El PDF se sube a `orders/{orderId}.pdf` en Storage (privado).
3. El correo adjunta el PDF; no usa enlace público.
4. Errores de Resend/FCM se loguean, no hacen fallar el pedido.

## Flujo 7 — PDFs

- `getOrderPdfUrl` exige autenticación y verifica que el token o sea `admin: true`
  o que `token.phone_number` coincida con `customerPhone` (solo para sesión SMS).
- `getOrderDetails` no expone PDF para clientes sin sesión.

## Flujo 8 — Webhook de productos

1. ERP `POST` con header `x-webhook-secret` contra `WEBHOOK_SECRET`.
2. Solo exige `sku`; campos ausentes se preservan (`merge: true`).
3. `isAvailable` deriva de `stock > 0`.
4. El webhook **no toca** `variants`, `images` ni `videoUrl`: los administra
   el APK; los envíos parciales del ERP no los pisan.
5. Tampoco escribe `name` ni `price` (los administra el APK) ni crea productos
   inexistentes (`404`): un tercero no puede renombrar ni revaluar el catálogo.
6. Los campos ignorados (`images`, `description`, `name`, `price`) se devuelven
   en `ignored` para que el ERP sepa que no surtieron efecto.

## Flujo 9 — Medios y gestión desde el APK

1. `products_screen.dart`: lista con buscador y acceso a Nuevo/Editar.
2. `product_edit_screen.dart`: datos, precio/stock, catálogos, **fotos**
   (subida a `products/{sku}/images/`, la primera es la portada), **video**
   (`pickVideo`, máx. 60 s y 25 MB), **variantes** (stock propio), especificaciones,
   etiquetas y SEO.
3. `product_media_service.dart`: compresión de fotos (`imageQuality: 80`,
   ancho máx. 1600 px), borrado de Storage al quitar/eliminar.
4. `catalogs_screen.dart` / `catalog_edit_screen.dart`: alta, edición y borrado
   de catálogos (el slug es inmutable).
5. `storage.rules`: `products/**` lectura pública (las fotos se ven en la web),
   escritura solo admin.
6. `orders_screen.dart` / `order_detail_screen.dart`: pedidos por estado
   (`pending`, `preparing`, `dispatched`, `cancelled`) y cambio de estado.
7. `catalog_products_screen.dart`: tocar un catálogo muestra sus productos con
   el mismo buscador, filtro y orden de la pestaña Productos.

## Flujo 10 — Contador de visitas

1. `web/components/visit-tracker.tsx` se monta una vez en `app/layout.tsx`.
2. Si el navegador no visitó hoy (`visit-tracked:AAAA-MM-DD`), escribe
   `metrics/visits` con `increment(1)` en `anonymous` o `registered`, según
   exista `customerProfile` en `localStorage`.
3. `firestore.rules` solo acepta incrementos de 1 sobre esos dos campos, y solo
   el admin puede leer el documento.
4. El APK lo muestra en la tarjeta "Visitas de la tienda"
   (`admin/lib/widgets/visits_stats_card.dart`); la web nunca lo muestra.

## Deuda técnica vigente

| Problema | Impacto | Ubicación |
|---|---|---|
| Fallback `addDoc` oculto en Functions | En producción crea pedidos sin guardia | `checkout/page.tsx` |
| El listado del catálogo se carga en el cliente | Productos no indexados uno a uno (la ficha sí es SSR) | `/catalogo/[id]` |
| Web y emuladores pueden cruzarse | por `.env.local` incorrecto | `web/` |
| Consulta de pedido sin SMS requiere el ID exacto | Única vía para invitados | `getOrderDetails` |
| `getOrderDetails` no devuelve PDF | Solo autenticados | `functions/` |
