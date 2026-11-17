---
description: Ejecuta el plan propuesto en esta conversación, lo verifica y lo deja corriendo (web local + APK en el Redmi)
agent: build
---

Eres el ejecutor del proyecto **Ventas Online** (repo: `C:\Users\eloy_\Downloads\VentasOnline`).
Tu tarea AHORA es ejecutar COMPLETO **el plan que se propuso en esta conversación** (el último plan acordado o propuesto antes de este comando). Si en la conversación no hay ningún plan propuesto, dilo y detente: no inventes un plan nuevo.

## Reglas duras (no negociables)

- **PROHIBIDO** sin confirmación explícita del usuario: `seed`, `deploy`, escritura en producción, cambios en `firestore.rules`/`storage.rules` ya desplegadas, o tocar `functions/.env`. Solo local y emuladores.
- Hay cambios sin commitear del usuario en el working tree: no los borres, no los reviertas y no hagas `git commit`/`push` salvo que el plan lo pida o el usuario lo confirme.
- TypeScript estricto, UI y docs en español, nombres de Firestore en `camelCase`. Reutiliza `web/lib/firebase.ts` y `web/lib/serverData.ts`; no dupliques inicialización.
- Antes de cualquier `next build`, detén cualquier `next dev` previo sobre el mismo `.next` (no se mezclan dev y build; si algo queda corrupto, borra `.next`).

## Pasos

1. **Relee el plan** propuesto en la conversación y enumera sus tareas. Identifica qué áreas toca: `web/`, `functions/`, `admin/`.
2. **Implementa** todo el plan completo (sin TODOs ni placeholders). Explica brevemente el porqué de cada cambio no trivial, en español.
3. **Verificación automática** según lo tocado (ver `AGENTS.md`):
   - `functions/` → `npm --prefix functions run build` y `npm --prefix functions run test`
   - `web/` → `npm run build` dentro de `web/` y `npm --prefix web run test`
   - `admin/` → dentro de `admin/`: `flutter test` (y `flutter analyze` si compiló)
   - Si el plan toca el webhook → `npm --prefix functions run webhook:test`
4. **Web en local**:
   - Revisa qué puertos están ocupados (3000, 3001, 3002). Usa un puerto libre; si el 3000 está libre úsalo, si no elige el siguiente libre.
   - Arranca la web en segundo plano (`npm run dev -p <puerto>` o `npm run build` + `npm run start -p <puerto>`), espera a que compile sin errores y verifica con una petición real (p. ej. `curl -I http://localhost:<puerto>`).
   - No toques el negocio de producción: si el plan implica escrituras o datos, configura la web contra los emuladores (`NEXT_PUBLIC_USE_EMULATORS=true`) como indica la memoria del proyecto.
5. **APK en el celular**:
   - `adb` = `C:\Users\eloy_\AppData\Local\Android\Sdk\platform-tools\adb.exe` (si no existe ahí, cae a `adb` del PATH).
   - Comprueba el teléfono: `& $adb devices` → debe aparecer un dispositivo (esperado: el Redmi). Si no hay ninguno, **NO digas que está instalado**; reporta la causa (cable, depuración USB, etc.).
   - Compila: dentro de `admin/`, `flutter build apk`.
   - Instala SIEMPRE con usuario 0 (MIUI/Redmi a veces lo deja solo en el espacio de usuario 10):
     `& $adb install -r --user 0 build\app\outputs\flutter-apk\app-release.apk`
     (si el artefacto generado tiene otro nombre, usa el que realmente salió del build).
   - Verifica instalación: `& $adb shell pm list packages --user 0 com.ventas.admin` → debe devolver `package:com.ventas.admin`.
   - Abre la app en el celular: `& $adb shell am start -n com.ventas.admin/.MainActivity`.
6. **Prueba funcional** en lo que el plan haya cambiado: recorre los flujos afectados en la web local (y usa los e2e del repo si aplican, p. ej. `npm --prefix web run e2e:visits`) y en el APK contra lo que corresponda (emuladores o producción según el plan). Reporta evidencia (respuestas, salidas de tests, capturas de logs relevantes).

## Mensaje final OBLIGATORIO

Aunque algo falle o quede pendiente, incluye SIEMPRE estos dos avisos explícitos:

- 📱 `AVISO: APK instalado en el celular Redmi (com.ventas.admin, usuario 0) — verificado con pm list packages` **solo si la verificación del paso 5 fue exitosa**. Si no: `AVISO: APK NO instalado en el celular — <causa>`.
- 🌐 `AVISO: la web está corriendo en http://localhost:<PUERTO>` con el puerto REAL que quedó escuchando. Si no arrancó: `AVISO: la web NO está corriendo — <causa>`.

Además resume: qué se hizo, qué se probó (y con qué resultado), qué quedó pendiente y qué debería revisar el usuario a mano.

Indicaciones extra del usuario (pueden venir vacías): $ARGUMENTS
