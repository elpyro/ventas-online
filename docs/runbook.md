# Runbook — Ventas Online

Comandos de operación. Ejecutar desde la raíz del repositorio salvo que se indique otra cosa.

## Requisitos

```powershell
node --version          # 22.x
npm --version
firebase --version      # 14.x
java -version           # necesario para el emulador de Firestore
flutter --version       # solo para el APK
gcloud --version        # solo para ADC
```

```powershell
npm install --prefix web
npm install --prefix functions
```

## Fijar el proyecto

```powershell
firebase use ventas-online-ec
firebase use --json
```

## Web

```powershell
cd web
npm run dev
npm run build
cd ..
```

Web local: http://localhost:3000
Lee Firestore de producción mediante `web/.env.local`.

## Emuladores

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
firebase emulators:start --config firebase.emulators.json --only "functions,firestore" --project ventas-online-ec
```

UI: http://127.0.0.1:4000
Puertos: Functions 5001, Firestore 8080.

## Sembrar el emulador

```powershell
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
npm --prefix functions run seed -- --project ventas-online-ec
```

## Probar el webhook en local

```powershell
$env:WEBHOOK_URL = "http://127.0.0.1:5001/ventas-online-ec/us-central1/webhookSku"
$env:WEBHOOK_SECRET = "dev-secret"
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:FIREBASE_PROJECT = "ventas-online-ec"
npm --prefix functions run webhook:test
```

Resultado esperado: 401 sin secreto, 400 sin SKU, 200 con payload válido.

## Sembrar producción

```powershell
gcloud auth application-default login
npm --prefix functions run seed -- --project ventas-online-ec
```

Datos editables en `functions/scripts/seed-data.mjs`.

## Compilar Functions

```powershell
npm --prefix functions run build
```

## Desplegar reglas

```powershell
firebase deploy --only firestore:rules
firebase deploy --only storage
```

## Desplegar Functions

```powershell
Copy-Item functions\.env.example functions\.env
notepad functions\.env
npm --prefix functions run build
firebase deploy --only functions --project ventas-online-ec
```

`functions/.env` debe contener:

```text
WEBHOOK_SECRET=<secreto-real>
RESEND_API_KEY=<api-key>
RESEND_FROM=pedidos@ventas.online
```

## Probar el webhook de producción

```powershell
$env:WEBHOOK_URL = "https://us-central1-ventas-online-ec.cloudfunctions.net/webhookSku"
$env:WEBHOOK_SECRET = "<secreto-real>"
$env:FIREBASE_PROJECT = "ventas-online-ec"
$env:GOOGLE_ACCESS_TOKEN = (gcloud auth print-access-token).Trim()
$env:WEBHOOK_TEST_SKU = "A1"
Remove-Item Env:FIRESTORE_EMULATOR_HOST -ErrorAction SilentlyContinue
npm --prefix functions run webhook:test
```

Atención: este test escribe en producción (re-escribe el stock que el producto
ya tiene y solo toca `updatedAt`). El token de gcloud es para leer los
documentos y verificar que nombre y precio no cambian; sin él el script omite
esas comprobaciones.

## Verificar datos

```powershell
$base = "https://firestore.googleapis.com/v1/projects/ventas-online-ec/databases/(default)/documents"
Invoke-RestMethod "$base/store_config/general"
Invoke-RestMethod "$base/catalogs"
Invoke-RestMethod "$base/products"
```

## Logs

```powershell
npm --prefix functions run logs
firebase functions:log --only webhookSku
```

## APK admin

```powershell
cd admin
flutter pub get
flutter analyze
flutter build apk
cd ..
```

El claim `admin: true` se asigna fuera del APK, con el Admin SDK o una Function.
No se puede poner desde la consola web. En esta máquina gcloud ya está autenticado y
basta el script del repo (usa `gcloud auth print-access-token`, no guarda claves):

```powershell
# Habilitar Authentication > Sign-in method > Email/Password y crear el usuario ahí (Users > Agregar usuario).
npm --prefix functions run admin:claim -- <correo>
```

Qué hace: busca el usuario por correo, fusiona `admin: true` en sus `customAttributes`
(sin borrar otros claims), confirma la escritura y muestra el uid. Si falta un usuario
diría `No existe el usuario <correo>`.

Después de asignar el claim, el siguiente login en el APK toma el nuevo claim
(`getIdTokenResult(true)` fuerza el refresco). Un token ya emitido sigue válido hasta
que expire; no hace falta revocar nada en la práctica.

**Distinguir el síntoma:** el APK dice *"No tienes permisos de administrador"* si la
clave es correcta pero falta el claim; *`INVALID_LOGIN_CREDENTIALS`* si el usuario no
existe o la clave es incorrecta; *`OPERATION_NOT_ALLOWED`* si Email/Password está
deshabilitado en el proveedor.

Ojo: ese mismo claim es el que usan `firestore.rules` y `storage.rules`
(`request.auth.token.admin == true`), así que sin él la app puede abrirse pero no
cargar ni modificar datos autenticados.

## Probar el APK contra los emuladores

El APK se conecta por defecto a **producción**. Para probarlo con datos de prueba
sin tocar datos reales:

```powershell
# 1. Emuladores con Auth incluido (ver firebase.emulators.json)
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
firebase emulators:start --config firebase.emulators.json --only "auth,functions,firestore,storage" --project ventas-online-ec

# 2. Resembrar datos de prueba y el admin del emulador (admin@ventas.test / admin1234)
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
npm --prefix functions run seed -- --project ventas-online-ec
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
node functions\scripts\seed-emulator-admin.mjs

# 3. Compilar el APK de prueba (apunta a los emuladores, NO a producción)
cd admin; flutter build apk --release --dart-define=USE_EMULATORS=true; cd ..

# 4. Hacer que el teléfono llegue a los emuladores por USB
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb reverse tcp:8080 tcp:8080
& $adb reverse tcp:9099 tcp:9099
& $adb reverse tcp:9199 tcp:9199
& $adb install -r admin\build\app\outputs\flutter-apk\app-release.apk
```

El APK de producción es el mismo pero **sin** `--dart-define=USE_EMULATORS=true`;
sin ese flag todos los puntos 1-4 no cambian nada y la app habla con producción.

### Por qué el APK necesita configuración extra para los emuladores

Dos cosas rompen la conexión si se pasan por alto:

1. **`automaticHostMapping: false`** (en `admin/lib/main.dart`). El SDK de
   FlutterFire cambia `127.0.0.1` por `10.0.2.2` porque asume el emulador de
   Android; esa dirección no existe en un teléfono real. Con el mapeo apagado,
   `127.0.0.1` + `adb reverse` funciona por USB.
2. **HTTP sin cifrar.** Android 9+ bloquea el tráfico `http://`. El APK trae
   `android/app/src/main/res/xml/network_security_config.xml`, que permite
   cleartext **solo** para `127.0.0.1`, `localhost` y `10.0.2.2`. Los dominios
   reales siguen exigiendo HTTPS.

Si ves `Cleartext HTTP traffic to ... not permitted` o
`Mapping ... Emulator host "127.0.0.1" to "10.0.2.2"` en logcat, falta una de
las dos piezas anteriores.

Al terminar de probar contra los emuladores, limpia los datos de la app antes de
volver a producción (`adb shell pm clear com.ventas.admin`): la caché de
Firestore guarda documentos por proyecto y los mezclaría.

## Verificación final

```powershell
npm --prefix functions run build
cd web; npm run build; cd ..
firebase use --json
```

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| El CLI apunta a otro proyecto | Mapeo global en `C:\Users\eloy_\` | `firebase use ventas-online-ec` |
| `No emulators to start` | `--only` mal interpretado | Usar comillas: `--only "functions,firestore"` |
| `Cannot emulate a web framework` | `firebase.json` incluye Hosting | Usar `--config firebase.emulators.json` |
| `spawn java ENOENT` | Sin Java en el PATH | Configurar `JAVA_HOME` con el JDK de Android Studio |
| `Cannot determine backend specification` | `firebase-functions` viejo, o el CLI solo espera 10 s a que la función declare su manifiesto | Mantener `7.4.0` o superior, recompilar y ampliar el margen: `$env:FUNCTIONS_DISCOVERY_TIMEOUT = "60"` |
| El webhook responde 404 en el emulador | Functions no cargaron | Revisar el log; compilar con `npm run build` |
| `Failed to initialize Firestore client` al sembrar | Falta ADC en producción | `gcloud auth application-default login` |
| La web no muestra datos | `.env.local` incompleto | Revisar `NEXT_PUBLIC_FIREBASE_*` |
| El emulador arranca sin Functions | Error de carga silencioso | Revisar `firebase-debug.log` |

## Revertir

```powershell
firebase functions:log
firebase deploy --only functions --project ventas-online-ec
```

Las reglas y Functions se pueden volver a desplegar desde el commit anterior.
Los datos de Firestore no se revierten con un deploy: restaurar desde backup.
