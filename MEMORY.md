# Memoria del proyecto — Ventas Online

Última actualización: 2026-11-10
Estado cambiante. Las reglas estables viven en `AGENTS.md`.
Actualizar solo en hitos importantes, no en cada conversación.

## Estado actual

- Proyecto Firebase: `ventas-online-ec`. CLI fijado con `firebase use ventas-online-ec`.
- **Respaldo en GitHub**: https://github.com/elpyro/ventas-online (privado, rama `main`).
  Flujo: `git add . && git commit -m "..." && git push`.
- **Producción**: Functions (9) y reglas Firestore/Storage desplegadas; la web
  todavía NO está publicada (Hosting sin releases). `WEBHOOK_SECRET` YA está
  configurado en `functions/.env` y `webhookSku` desplegado con él (verificado:
  401 sin secret, 200 con secret, actualización parcial intacta). Faltan
  `RESEND_API_KEY`/`RESEND_FROM`: no salen correos de pedidos.
  El secret solo vive en `functions/.env` (ignorado por git); nunca en chats.
- Emuladores (Functions + Firestore + Storage) funcionando en 4000 / 8080 / 5001 / 9199.
- **Migración CELTOONS** (respaldo JSON del proyecto briges, tienda de celulares):
  280 productos importados a PRODUCCIÓN y al emulador con
  `npm --prefix functions run import:celtoons` (script: `functions/scripts/import-celtoons.mjs`).
  Catálogo único `tecnologiaymas` ("Tecnología"), creado por el dueño desde el APK
  (el script no lo pisa si ya existe). Los catálogos demo viejos (`hogar`, `tecnologia`,
  `m`) se conservaron vacíos. Precios desde `precio_venta`; stocks negativos a 0;
  SKUs saneados (espacios→guiones, vacíos generados del nombre, duplicados con
  sufijo): lista completa en `docs/migracion-celtoons.md` (177 SKUs). Las 267 fotos
  se copiaron al Storage propio (`products/{sku}/images/import-N.jpg` con token).
  El catálogo con los 8 productos demo de producción fue reemplazado.
  ADC: `gcloud auth application-default login` con ecbt9Claret@gmail.com (owner
  del proyecto). REST sin `?key=` dio un 403 transitorio tras la escritura masiva;
  se recuperó solo.
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
  preguntas frecuentes, colores y banners; `store_seo_screen.dart` agrupa SEO,
  imagen OG, llms.txt, redes sociales y clave Gemini. Cada una carga y guarda lo
  suyo (no se pisan).
  Bloque reutilizable `widgets/soft_section.dart` (`SoftSection`, `softField`).
- **Preguntas frecuentes**: se agregan, editan y eliminan desde el APK
  (Apariencia) en `store_config/general.faqs` (`[{question, answer}]`). La web
  las lee con respaldo a las 5 de siempre y genera el JSON-LD `FAQPage`; si el
  array existe pero está vacío, la sección no se muestra.
- Fix miniaturas estiradas: `SoftThumbnail` limita solo `cacheWidth` (antes
  `cacheWidth` + `cacheHeight` deformaban fotos no cuadradas).
- FAB "Nuevo producto" con estilo 3D suave en `catalog_products_screen.dart`.
- **Edición masiva (multiselector)**: mantener presionado un producto en la
  lista de un catálogo activa el modo selección (vibración + borde azul +
  checks); tocar alterna, botón atrás sale del modo antes de cerrar.
  Barra contextual con contador, seleccionar todos (los visibles) y
  "Editar seleccionados" → `bulk_edit_screen.dart`: precio, stock, disponible,
  destacado, marca, orden, agregar/quitar catálogos. Solo se escriben los
  campos editados (vacío/"Sin cambiar" = intacto); stock omitido en productos
  con variantes; se avisa si un cambio dejaría un producto sin catálogo.
  Escrituras con WriteBatch en lotes de 400 + `updatedAt`.
  Además edita en lote: **etiquetas** (agregar sin duplicar o reemplazar),
  **título/descripción SEO** y **especificaciones** (merge por nombre de
  campo, nunca borra las existentes).
- **Borrar seleccionados**: icono de basura en la barra del multiselector.
  Diálogo de confirmación (N productos + fotos/videos; pedidos conservan
  sus datos) y luego diálogo de progreso no cancelable que borra por
  producto: media de Storage → doc de Firestore; fallas por SKU se
  reportan al final sin cortar el lote. Instalado y corriendo en el
  Redmi Note 9 Pro via adb (`flutter build apk` + `adb install -r`).
- **Tile de catálogo**: badge verde "N productos" vía `count()` de Firestore
  (agregación en servidor). El lápiz de editar catálogo se mantiene en el
  tile (se quitó una vez y se devolvió: el dueño lo usa como acceso directo).

## Flujo de compra (actual)

1. Agregar productos → panel o `/carrito`.
2. Checkout: opcionalmente precargado desde el navegador.
3. `createOrder` valida y crea pedido (las reglas rechazan `addDoc` directo).
4. Pantalla de **éxito**: ID del pedido + botones opcionales:
   - **Enviar por WhatsApp** (no automático)
   - **Ver mis pedidos** (consulta por `orderId` + teléfono)
5. Cliente queda registrado en el navegador hasta cerrar sesión.

## Pendiente (priorizado)

1. Configurar `RESEND_API_KEY`/`RESEND_FROM` en `functions/.env` y
   redesplegar `onOrderCreated`: sin esos secretos no salen correos de
   pedidos. (`WEBHOOK_SECRET` ya está hecho y verificado.)
2. Publicar la web (Hosting o Vercel) y fijar `NEXT_PUBLIC_SITE_URL` real.
3. Tests de reglas/Functions, CI y proyecto `dev` separado.
4. Firmar el APK con keystore propio (hoy usa la clave debug) y subir `versionCode`.
5. Probar la subida de fotos/video desde el APK contra los emuladores
   (`--dart-define=USE_EMULATORS=true`; el interruptor ya existe).
6. Migrar el listado del catálogo a Server Components (la ficha ya es SSR).
7. Revisar los catálogos demo vacíos (`hogar`, `tecnologia`, `m`): ocultarlos
   desde el APK o borrarlos cuando haya productos reales para ellos.

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

Antes de producción: configurar `functions/.env`, limpiar datos demo, publicar la
web con `NEXT_PUBLIC_SITE_URL` real y firmar el APK.
