import 'package:flutter/material.dart';
import '../theme/soft_theme.dart';

/// Bloque de configuración: título + tarjeta "3D suave".
///
/// Se usa en Config y en sus pantallas hijas (Apariencia, Google e IA) para que
/// todas se vean igual sin repetir decoraciones.
class SoftSection extends StatelessWidget {
  const SoftSection({super.key, required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 14, 4, 6),
          child: Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 16,
              color: SoftTheme.text,
            ),
          ),
        ),
        SoftTile(
          margin: EdgeInsets.zero,
          padding: const EdgeInsets.all(16),
          child: child,
        ),
        const SizedBox(height: 6),
      ],
    );
  }
}

/// Campo de texto con el estilo suave de la app.
InputDecoration softField(String label, {String? helperText}) {
  return InputDecoration(
    labelText: label,
    helperText: helperText,
    filled: true,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
  );
}
