# Modelo de datos — Ventas Online

Firestore en modo nativo, proyecto `ventas-online-ec`.
Todas las fechas de escritura usan `serverTimestamp()` o `new Date()` en Functions.

## Mapa de colecciones

| Colección | ID del documento | Propósito |
|---|---|---|
| `store_config` | `general` | Configuración global de la tienda |
| `catalogs` | slug (`hogar`, `tecnologia`) | Catálogos visibles en la web |
| `products` | SKU (`SKU-001`) | Productos y stock |
| `customers` | teléfono E.164 (`+57...`) | Perfil del cliente |
| `orders` | autogenerado | Pedidos |
| `admin_tokens` | token FCM | Dispositivos del APK admin |
| `metrics/visits/history/{YYYY-MM-DD}` | fecha UTC | Contador de visitas por día + clientes registrados |

## Relaciones

- `products.catalogIds[]` → IDs de `catalogs`. Un producto puede estar en varios.
- `orders.items[].sku` → `products/{sku}`.
- `orders.items[].catalogId` → `catalogs/{id}`.
- `orders.customerPhone` → `customers/{phone}`.
- No hay claves foráneas reales: la integridad se valida en código.

## `store_config/general`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `companyName` | string | sí | Nombre visible de la tienda |
| `phoneContact` | string | sí | WhatsApp en formato internacional sin `+` (para `wa.me`) |
| `city` | string | sí | Ciudad usada en el JSON-LD |
| `globalMinOrder` | number | sí | Compra mínima global en COP |
| `banners` | array | no | Banners de la home |
| `banners[].id` | string | sí | Identificador del banner |
| `banners[].imageUrl` | string | sí | URL de la imagen |
| `banners[].redirectUrl` | string | no | Ruta al hacer clic |
| `banners[].isActive` | boolean | sí | Si se muestra |
| `faqs` | array | no | Preguntas frecuentes de la home (editables desde el APK → Apariencia) |
| `faqs[].question` | string | sí | Texto de la pregunta |
| `faqs[].answer` | string | sí | Respuesta que se muestra debajo |
| `updatedAt` | timestamp | sí | Última escritura |

```json
{
  "companyName": "Ventas Online",
  "phoneContact": "573125866072",
  "city": "Bogotá",
  "globalMinOrder": 10,
  "banners": [
    {
      "id": "banner-demo",
      "imageUrl": "https://picsum.photos/seed/ventas-online/1200/300",
      "redirectUrl": "/catalogos",
      "isActive": true
    }
  ],
  "faqs": [
    {
      "question": "¿Cómo compro?",
      "answer": "Elige un catálogo, agrega productos al carrito y completa el checkout con tus datos."
    }
  ],
  "updatedAt": "<timestamp>"
}
```

## `catalogs/{catalogId}`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `title` | string | sí | Nombre visible |
| `coverImage` | string | sí | Imagen de portada |
| `isActive` | boolean | sí | Si se puede comprar |
| `isVisible` | boolean | sí | Si aparece en la home |
| `minOrderSubtotal` | number | sí | Subtotal mínimo dentro del catálogo |
| `priority` | number | sí | Orden ascendente en la home |
| `updatedAt` | timestamp | sí | Última escritura |

```json
{
  "title": "Hogar",
  "coverImage": "https://picsum.photos/seed/hogar/600/400",
  "isActive": true,
  "isVisible": true,
  "minOrderSubtotal": 20,
  "priority": 1,
  "updatedAt": "<timestamp>"
}
```

## `products/{sku}`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `sku` | string | sí | Igual al ID del documento |
| `name` | string | sí | Nombre del producto |
| `price` | number | sí | Precio unitario en COP (o precio base si hay variantes) |
| `stock` | number | sí | Unidades disponibles. Si hay `variants`, es la suma de sus stocks y lo **recalcula el servidor** |
| `isAvailable` | boolean | sí | Derivado: stock (total) > 0, salvo despublicación manual |
| `images` | string[] | no | URLs de imágenes |
| `catalogIds` | string[] | sí | Catálogos a los que pertenece |
| `priority` | number | no | Orden visible en el catálogo web: menor = aparece primero (defecto 9999) |
| `description` | string | no | Descripción larga |
| `brand` | string | no | Marca (búsqueda y ficha) |
| `variants` | array | no | Variantes con stock y precio propios (ver abajo) |
| `videoUrl` | string | no | URL MP4 subido a Storage por el admin |
| `specs` | array | no | `{ label, value }`: material, garantía, peso… |
| `tags` | string[] | no | Etiquetas para el buscador |
| `featured` | boolean | no | Destacado en la home |
| `seoTitle` / `seoDescription` | string | no | SEO propio del producto |
| `updatedAt` | timestamp | sí | Última escritura |
| `createdAt` | timestamp | no en datos demo | Alta del producto (desde el admin) |

### Variantes de producto

```json
"variants": [
  { "id": "negro", "color": "Negro", "colorHex": "#111111", "stock": 4 },
  { "id": "blanco-m", "color": "Blanco", "colorHex": "#f8fafc", "size": "M", "price": 31.5, "stock": 3 }
]
```

- `id`: slug estable dentro del producto (lo genera el admin).
- `price`: si falta, el producto aplica su `price` base.
- Stock **propio** por variante: `createOrder` descuenta cada variante comprada y
  reescribe el array completo en la misma transacción; `stock` del producto se
  recalcula como la suma.
- Si el producto tiene `variants`, el carrito y el pedido llevan `variantId`,
  y `variantLabel` ("Negro / M") se guarda en la línea del pedido.

```json
{
  "sku": "SKU-001",
  "name": "Juego de ollas 5 piezas",
  "price": 45.9,
  "stock": 12,
  "isAvailable": true,
  "images": ["https://picsum.photos/seed/ollas/600/400"],
  "catalogIds": ["hogar"],
  "description": "Set de ollas antiadherentes para uso diario.",
  "brand": "HogarPro",
  "tags": ["ollas", "cocina", "set"],
  "specs": [{ "label": "Garantía", "value": "1 año" }],
  "updatedAt": "<timestamp>"
}
```

> Trampa: `isAvailable` y `stock` pueden contradecirse si se editan por separado.
> La regla es `isAvailable = stock > 0` (con `stock` derivado de variantes si las hay).

## `customers/{phone}`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `phone` | string | sí | Teléfono E.164; igual al ID |
| `name` | string | sí | Nombre del cliente |
| `email` | string | sí | Correo para la confirmación |
| `address` | string | sí | Dirección de entrega |
| `createdAt` | timestamp | sí | Alta del cliente |

```json
{
  "phone": "+573125866072",
  "name": "Cliente Demo",
  "email": "cliente@example.com",
  "address": "Av. Siempre Viva 123",
  "createdAt": "<timestamp>"
}
```

## `orders/{orderId}`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `customerPhone` | string | sí | Teléfono del cliente autenticado |
| `customerName` | string | sí | Nombre de contacto |
| `customerEmail` | string | sí | Correo para Resend |
| `deliveryAddress` | string | sí | Dirección de entrega |
| `items` | array | sí | Líneas del pedido |
| `items[].sku` | string | sí | Producto |
| `items[].name` | string | sí | Copia del nombre al comprar |
| `items[].catalogId` | string | sí | Catálogo de origen |
| `items[].unitPrice` | number | sí | Precio al momento de comprar |
| `items[].quantity` | number | sí | Cantidad |
| `items[].subtotal` | number | sí | `unitPrice * quantity` |
| `items[].variantId` | string | no | ID de la variante elegida |
| `items[].variantLabel` | string | no | "Negro / M" (lo calcula el servidor) |
| `total` | number | sí | Suma de subtotales |
| `status` | string | sí | `pending`, `preparing`, `dispatched` o `cancelled` |
| `pdfUrl` | string | no | Lo escribe `onOrderCreated` |
| `createdAt` | timestamp | sí | Fecha del pedido |

```json
{
  "customerPhone": "+573125866072",
  "customerName": "Cliente Demo",
  "customerEmail": "cliente@example.com",
  "deliveryAddress": "Av. Siempre Viva 123",
  "items": [
    {
      "sku": "SKU-001",
      "name": "Juego de ollas 5 piezas",
      "catalogId": "hogar",
      "unitPrice": 45.9,
      "quantity": 2,
      "subtotal": 91.8
    }
  ],
  "total": 91.8,
  "status": "pending",
  "createdAt": "<timestamp>"
}
```

> **Cancelar un pedido no repone stock.** `createOrder` descuenta inventario en la
> misma transacción en la que crea el pedido, así que un pedido cancelado conserva el
> descuento; si hace falta, ajusta el stock desde la app admin.

## `admin_tokens/{token}`

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| *(ID)* | string | sí | Token FCM del dispositivo |
| `platform` | string | no | `android` u `ios` (propuesto) |
| `updatedAt` | timestamp | no | Última actualización (propuesto) |

Hoy el trigger solo usa el ID del documento.

## Reglas de acceso (resumen)

| Colección | Lectura | Escritura |
|---|---|---|
| `products` | pública | admin (`admin == true`) |
| `catalogs` | pública | admin |
| `store_config` | pública | admin |
| `customers` | solo el dueño del teléfono | solo el dueño del teléfono |
| `orders` | dueño o admin | crear: autenticado; editar/borrar: admin |
| `admin_tokens` | admin | admin |
| `metrics` | admin | anónimos/autenticados: solo incremento de 1 en `anonymous` o `registered` |

El detalle exacto está en `firestore.rules`.

## `metrics/visits`

| Campo | Tipo | Descripción |
|---|---|---|
| `anonymous` | number | Visitas de desconocidos (sin `customerProfile` en el navegador) |
| `registered` | number | Visitas de clientes con perfil guardado |
| `updatedAt` | timestamp | Última visita contabilizada |

Lo alimenta el tracker de la web (`web/components/visit-tracker.tsx`), que cuenta
**una visita por día y navegador**. Las reglas solo aceptan incrementos de 1 en uno
(no se puede poner un número arbitrario ni tocar otros campos). Solo lo lee el APK
admin (tarjeta "Visitas de la tienda"); en la web no se muestra.

### Historial por día

`metrics/visits/history/{YYYY-MM-DD}` (UTC) con los mismos campos
(`anonymous` / `registered` / `updatedAt`). Además, por día hay subcolección
`customers/{phone}` con `{name, phone, at}` para los clientes registrados
(no anónimos). El Panel del APK lee de esta subcolección: el doc de hoy
es el detalle de hoy y el resto es el historial reciente. El doc
`metrics/visits` sigue existiendo como contador acumulado para compatibilidad.

## Campos propuestos (no implementados)

| Campo | Colección | Motivo |
|---|---|---|
| `statusHistory[]` | `orders` | Auditar cambios de estado |
| `reservedStock` | `products` | Reservar unidades durante el checkout |
| `updatedBy` | `products`, `catalogs` | Saber quién editó |
| `serverTotal` | `orders` | Separar total calculado en servidor |
| `platform` | `admin_tokens` | Depurar notificaciones por dispositivo |
| `deletedAt` | `products` | Borrado lógico en vez de físico |
