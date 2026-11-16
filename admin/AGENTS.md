# Admin (APK) — instrucciones

Aplican solo a `admin/`. Se combinan con el `AGENTS.md` de la raíz.

## Comandos

```powershell
cd admin
flutter pub get
flutter analyze
flutter build apk
flutter run
cd ..
```

## Estructura

- `lib/main.dart`: inicializa Firebase y monta `AuthGate` (login o dashboard según el estado de sesión).
  Con `--dart-define=USE_EMULATORS=true` apunta a los emuladores (ver docs/runbook.md).
- `lib/screens/login_screen.dart`: autenticación.
- `lib/screens/dashboard_screen.dart`: pestañas Productos / Catálogos / Pedidos / Config.
- `lib/screens/products_screen.dart`: productos (búsqueda, filtros y orden; tarjeta de visitas).
- `lib/screens/product_edit_screen.dart`: alta/edición de producto con fotos, video, variantes y SEO.
- `lib/screens/catalogs_screen.dart`: catálogos; tocar uno abre `catalog_products_screen.dart`.
- `lib/screens/catalog_products_screen.dart`: productos de un catálogo (mismo `ProductList`).
- `lib/screens/orders_screen.dart`: pedidos con filtros por estado.
- `lib/screens/order_detail_screen.dart`: detalle y cambio de estado del pedido.
- `lib/screens/config_screen.dart`: configuración de la tienda.
- `lib/widgets/`: piezas compartidas (`product_list.dart`, `order_status_badge.dart`, `visits_stats_card.dart`).
- `lib/services/search_normalizer.dart`: normaliza tildes para buscar igual que la web.
- `android/app/google-services.json`: configuración de Firebase. No editar a mano.

## Reglas de código

- Widgets pequeños y con una sola responsabilidad; extraer a widgets con nombre
  cuando el `build` supere ~80 líneas.
- Validar los formularios antes de escribir en Firestore (campos vacíos,
  números válidos, stock no negativo).
- Manejar los estados `loading`, `error` y vacío en cada pantalla.
- Mostrar mensajes de error claros en español; no exponer excepciones crudas.
- UI, textos y mensajes en español; nombres de código en inglés.
- Usar `const` donde sea posible y evitar `setState` para datos que vienen de Firestore.
- No crear instancias nuevas de Firebase: ya se inicializa en `main.dart`.

## Seguridad

- El APK es solo para usuarios con el custom claim `admin: true`.
- Ese claim se asigna fuera del APK (Admin SDK o Cloud Function), nunca desde la app.
- Sin el claim, las reglas de Firestore rechazan las escrituras aunque el login funcione.
- Comprobar el claim: leer el ID token y revisar `admin`.
- Nunca guardar contraseñas, tokens ni claves en el código o en `SharedPreferences`.
- Los tokens FCM se registran en `admin_tokens/{token}`; no enviar notificaciones
  desde el APK.

## Trampas conocidas

- `MainActivity.kt` debe vivir en `android/app/src/main/kotlin/com/ventas/admin/`
  con `package com.ventas.admin` (el `namespace` y `applicationId` del manifiesto).
  Si el paquete no coincide, el APK **compila** pero se cierra al abrir
  (`ClassNotFoundException`). Esto ya ocurrió: se creó en una carpeta temporal
  con el paquete `com.example.flutter_tmp` y nadie verificó la coincidencia.

## Limitaciones conocidas

- El APK **habla con producción** por defecto; para probar contra los emuladores:
  `flutter build apk --release --dart-define=USE_EMULATORS=true`
  y `adb reverse tcp:8080 tcp:8080` (y 9099/9199/5001). Ver docs/runbook.md.
- La pantalla de pedidos lista y filtra pedidos; cambiar el estado escribe en
  `orders` (requiere el claim admin). Cancelar un pedido repone el stock
  descontado (el stock se descuenta al crear el pedido, en estado pendiente).
- No hay tests de widgets.
- `google-services.json` debe existir para compilar; sin él, el build falla.
- Las fotos y videos subidos quedan en Storage para siempre: borrarlos desde la
  app **sí** borra el objeto, pero borrar el documento del producto a mano no.

## Verificación

```powershell
flutter analyze
flutter build apk
```

`flutter analyze` debe terminar sin errores ni advertencias nuevas.
