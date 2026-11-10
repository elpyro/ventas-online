import '../theme/soft_theme.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final emailCtrl = TextEditingController();
  final passCtrl = TextEditingController();
  String? error;
  bool loading = false;
  bool resetting = false;

  @override
  void dispose() {
    emailCtrl.dispose();
    passCtrl.dispose();
    super.dispose();
  }

  /// Traduce los errores de Firebase Auth a algo que el usuario entienda.
  /// El detalle técnico se mantiene fuera de la pantalla a propósito.
  String _mensajeError(Object e) {
    if (e is FirebaseAuthException) {
      switch (e.code) {
        case 'invalid-credential':
        case 'invalid-email':
        case 'user-not-found':
        case 'wrong-password':
          return 'Correo o contraseña incorrectos.';
        case 'user-disabled':
          return 'Esta cuenta está deshabilitada.';
        case 'too-many-requests':
          return 'Demasiados intentos seguidos. Espera un minuto.';
        case 'network-request-failed':
          return 'No hay conexión con el servidor. Revisa tu internet.';
        case 'operation-not-allowed':
          return 'El acceso con correo y contraseña no está disponible. Habla con el administrador.';
        default:
          return 'No se pudo iniciar sesión. Inténtalo otra vez.';
      }
    }
    return 'No se pudo iniciar sesión. Inténtalo otra vez.';
  }

  Future<void> _login() async {
    final email = emailCtrl.text.trim();
    final password = passCtrl.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => error = 'Escribe tu correo y tu contraseña.');
      return;
    }

    setState(() {
      error = null;
      loading = true;
    });
    try {
      final cred = await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
      final token = await cred.user!.getIdTokenResult(true);
      if (token.claims?['admin'] != true) {
        await FirebaseAuth.instance.signOut();
        setState(
            () => error = 'Esta cuenta no tiene permisos de administrador.');
        return;
      }
    } catch (e) {
      setState(() => error = _mensajeError(e));
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _recuperarContrasena() async {
    final ctrl = TextEditingController(text: emailCtrl.text.trim());
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Recuperar contraseña'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
                'Escribe el correo de administrador. Te enviaremos un correo para restablecer tu contraseña.'),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: 'Correo',
                prefixIcon: Icon(Icons.mail_outline),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Enviar correo'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final email = ctrl.text.trim();
    if (email.isEmpty) return;
    setState(() => resetting = true);
    try {
      await FirebaseAuth.instance.sendPasswordResetEmail(email: email);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content:
                  Text('Correo de recuperación enviado. Revisa tu bandeja.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_mensajeError(e))),
        );
      }
    } finally {
      if (mounted) setState(() => resetting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);

    return Scaffold(
      backgroundColor: SoftTheme.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    height: 56,
                    width: 56,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      color: theme.colorScheme.primary,
                    ),
                    child: Icon(Icons.storefront,
                        color: theme.colorScheme.primaryForeground),
                  ),
                  const SizedBox(height: 16),
                  Text('Ventas Online', style: theme.textTheme.h3),
                  const SizedBox(height: 2),
                  Text('Panel de administración', style: theme.textTheme.muted),
                  const SizedBox(height: 20),
                  ShadCard(
                    width: double.infinity,
                    title: Text('Iniciar sesión', style: theme.textTheme.h4),
                    description: const Text(
                      'Usa el correo de administrador de la tienda.',
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        ShadInput(
                          controller: emailCtrl,
                          placeholder: const Text('correo@ejemplo.com'),
                          keyboardType: TextInputType.emailAddress,
                          autofillHints: const [AutofillHints.username],
                          leading: const Padding(
                            padding: EdgeInsets.only(right: 8),
                            child: Icon(Icons.mail_outline, size: 18),
                          ),
                        ),
                        const SizedBox(height: 12),
                        ShadInput(
                          controller: passCtrl,
                          placeholder: const Text('Contraseña'),
                          obscureText: true,
                          autofillHints: const [AutofillHints.password],
                          leading: const Padding(
                            padding: EdgeInsets.only(right: 8),
                            child: Icon(Icons.lock_outline, size: 18),
                          ),
                          onSubmitted: (_) {
                            if (!loading) _login();
                          },
                        ),
                        if (error != null) ...[
                          const SizedBox(height: 12),
                          ShadAlert.destructive(
                            icon: const Icon(Icons.error_outline, size: 18),
                            title: const Text('No se pudo entrar'),
                            description: Text(error!),
                          ),
                        ],
                        const SizedBox(height: 16),
                        ShadButton(
                          onPressed: loading ? null : _login,
                          child: loading
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Text('Ingresar'),
                        ),
                        const SizedBox(height: 8),
                        ShadButton(
                          onPressed: resetting ? null : _recuperarContrasena,
                          child: resetting
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Text('Recuperar contraseña'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
