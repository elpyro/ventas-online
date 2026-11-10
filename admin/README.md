# Admin APK

1. Agrega `android/app/google-services.json` (descargado de Firebase Console).
2. Asigna el custom claim `admin: true` al usuario SuperAdmin (via Firebase Admin SDK o Cloud Function).
3. `flutter pub get`
4. `flutter build apk --release`
