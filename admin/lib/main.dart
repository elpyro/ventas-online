import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'screens/login_screen.dart';
import 'screens/dashboard_screen.dart';
import 'theme/soft_theme.dart';

// Con --dart-define=USE_EMULATORS=true la app se conecta a los emuladores locales.
// El teléfono llega a ellos por USB con `adb reverse tcp:8080 tcp:8080` etc.
const bool useEmulators = bool.fromEnvironment('USE_EMULATORS');
const String emulatorHost =
    String.fromEnvironment('EMULATOR_HOST', defaultValue: '127.0.0.1');

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // handle background
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  // Persistencia offline: reutiliza lo ya leído al reabrir (ahorra red/datos).
  // FirebaseFirestore la trae habilitada por defecto en móvil; la dejamos
  // explícita con caché ilimitada para que el APK abra sin esperar la red.
  FirebaseFirestore.instance.settings =
      const Settings(persistenceEnabled: true);
  if (useEmulators) {
    // automaticHostMapping: false evita que el SDK cambie 127.0.0.1 por
    // 10.0.2.2 (dirección del emulador de Android que no existe en un teléfono
    // físico). Así funciona con `adb reverse` por USB.
    await FirebaseAuth.instance
        .useAuthEmulator(emulatorHost, 9099, automaticHostMapping: false);
    FirebaseFirestore.instance
        .useFirestoreEmulator(emulatorHost, 8080, automaticHostMapping: false);
    await FirebaseStorage.instance
        .useStorageEmulator(emulatorHost, 9199, automaticHostMapping: false);
  }
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  runApp(const AdminApp());
}

class AdminApp extends StatelessWidget {
  const AdminApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Shadcn + Material: ShadApp.custom monta el tema shadcn por encima de un
    // MaterialApp; así los widgets Material siguen funcionando y los Shad*
    // usan el mismo look & feel que la web.
    return ShadApp.custom(
      themeMode: ThemeMode.light,
      theme: ShadThemeData(
        brightness: Brightness.light,
        colorScheme: ShadSlateColorScheme.light(),
      ),
      darkTheme: ShadThemeData(
        brightness: Brightness.dark,
        colorScheme: ShadSlateColorScheme.dark(),
      ),
      appBuilder: (context) => MaterialApp(
        title: 'Administrador Celtoons',
        theme: SoftTheme.materialTheme,
        localizationsDelegates: const [
          GlobalShadLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
        ],
        builder: (context, child) => ShadAppBuilder(child: child!),
        home: const AuthGate(),
        debugShowCheckedModeBanner: false,
      ),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Scaffold(
              body: Center(child: CircularProgressIndicator()));
        }
        if (snap.data == null) return const LoginScreen();
        return const DashboardScreen();
      },
    );
  }
}
