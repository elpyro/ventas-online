# Memoria del proyecto — Ventas Online

Última actualización: 2026-11-06
Estado cambiante. Las reglas estables viven en `AGENTS.md`.
Actualizar solo en hitos importantes, no en cada conversación.

## Estado actual

- Proyecto Firebase: `ventas-online-ec`. CLI fijado con `firebase use ventas-online-ec`.
- **Producción intacta**: Functions y reglas nuevas no están desplegadas.
- Emuladores (Functions + Firestore + Storage) funcionando en 4000 / 8080 / 5001 / 9199.
- Web de producción corriendo en http://localhost:3001 (`next start`, build nuevo).
- Web de emulador en http://localhost:3002 (`next dev`, `NEXT_PUBLIC_USE_EMULATORS=true`).
- Emulador con datos de PRODUCCIÓN (copiados por `npm --prefix functions run copy:prod`).

## Datos en emulador

- Copia automática desde producción de `products`, `catalogs` y `store_config`
  (`functions/scripts/copy-prod-to-emulator.mjs`).
- Pedidos demo y admin de prueba siguen en el emulador (no los copia el script).

## Funcionando

- `createOrder` en servidor: valida precios/stock/mínimos, descuenta inventario,
  pedido atómico. Ahora también soporta **variantes** (stock y precio por variante;
  `stock` del producto se recalcula como la suma). Web llama con `httpsCallable`.
- Ficha de producto en `/producto/[sku]`: servidor (SEO + JSON-LD `Product`),
  galería con video, especificaciones, colores/tallas con stock propio, compartir,
  productos relacionados del mismo catálogo.
- Buscador: en cada catálogo, global en la home (`/api/search`), página `/buscar`
  (noindex). Filtro simple en memoria normalizado sin tildes.
- **Cantidad en ficha**: `qty` es el TOTAL deseado. Si hay unidades en el carrito,
  arranca en ese número; el tope es el stock total. Al agregar se suma la diferencia
  (`delta`), al bajar se actualiza el carrito (`updateQty`). Helper muestra
  "N unidad(es) disponibles · M en tu carrito". Botón: Agregar / Actualizar carrito /
  En el carrito / Agotado. E2E (`web/scripts/e2e-visits.mjs`) OK contra el emulador.
- **Contador de visitas** (`metrics/visits`): anónimo y registrado, +1 por día y
  navegador (`visit-tracked:AAAA-MM-DD`), reglas `metrics/visits`. E2E OK.
- Admin (APK): crea, edita y elimina productos y catálogos; sube fotos y video
  directo a Storage (`products/{sku}/...`, lectura pública, escritura admin).
- **APK admin** (`shadcn_ui`): login en español (ShadCard/Input/Button/Alert),
  `products_screen` con miniaturas + badge de stock + filtros (Todos/Disponibles/
  Agotados/Destacados) + orden (nombre/precio/stock). Catálogos tab → tocar catálogo
  abre sus productos. Pedidos tab: lista por estado, detalle, cambio de estado
  (cancelar NO repone stock). `visits_stats_card` en Productos (solo APK).
- Fix reciente: ID del pedido mostrado completo (`Pedido #<id>`) en
  `orders_screen.dart` y `order_detail_screen.dart`.
- **Config dividida** (APK): `config_screen.dart` conserva solo datos de la
  tienda + dos tarjetas. `store_appearance_screen.dart` agrupa enunciado, badges,
  colores y banners; `store_seo_screen.dart` agrupa SEO, imagen OG, llms.txt,
  redes sociales y clave Gemini. Cada una carga y guarda lo suyo (no se pisan).
  Bloque reutilizable `widgets/soft_section.dart` (`SoftSection`, `softField`).
- Fix miniaturas estiradas: `SoftThumbnail` limita solo `cacheWidth` (antes
  `cacheWidth` + `cacheHeight` deformaban fotos no cuadradas).
- FAB "Nuevo producto" con estilo 3D suave en `catalog_products_screen.dart`.

## Flujo de compra (actual)

1. Agregar productos → panel o `/carrito`.
2. Checkout: opcionalmente precargado desde el navegador.
3. `createOrder` valida y crea pedido (fallback `addDoc` si Functions no existe).
4. Pantalla de **éxito**: ID del pedido + botones opcionales:
   - **Enviar por WhatsApp** (no automático)
   - **Ver mis pedidos** (consulta por `orderId` + teléfono)
5. Cliente queda registrado en el navegador hasta cerrar sesión.

## Pendiente (priorizado)

1. Desplegar Functions (`functions/.env` con `WEBHOOK_SECRET` real) + reglas
   Firestore/Storage actualizadas (ojo: `orders.create` debe ser solo vía Function).
2. Eliminar fallback `addDoc` en checkout cuando `createOrder` esté en prod.
3. Tests de reglas, CI y proyecto `dev` separado.
4. Pantalla de pedidos en APK admin (ya llega push FCM).
5. Reemplazar datos demo por datos reales.
6. Probar la subida de fotos/video desde el APK contra los emuladores
   (el APK actual apunta a producción; falta un interruptor de emulador).
7. Migrar el listado del catálogo a Server Components (la ficha ya es SSR).

## Decisiones

- Tienda en **Bogotá, Colombia** con despachos a todo el país; moneda **COP**.
  Formato `es-CO`/`COP` en web, APK, PDF y JSON-LD (`addressCountry: "CO"`).
  Helper único del APK: `admin/lib/utils/money.dart` (`CopFormat`).

- Sin SMS obligatorio para comprar; identidad ligera por teléfono, respetando
  que cualquier visitante puede afirmar ser dueño del número.
- `getOrderDetails` responde el MISMO error para "no existe" y
  "teléfono no coincide" (no filtra existencia de pedidos).
- El pie de página lista catálogos que no se están viendo.
- Emuladores vía `firebase.emulators.json` (incluye Storage 9199).
- `.next` compartido entre `next build` y `next dev` corrompe chunks:
  detener el dev server antes de compilar; borrar `.next` al cambiar config.

## Credenciales

- Emulador: admin@ventas.test / admin1234.
- Producción: castellanoseloy@gmail.com (claim admin: true).
- Sembrar producción requiere ADC; el ADC temporal se eliminó.
- Nunca guardar secretos en este archivo.

## Próximo paso

Antes de producción: completar config SEO/redes en admin, desplegar Functions y reglas, y fijar `NEXT_PUBLIC_SITE_URL`. Después desplegar la web.
