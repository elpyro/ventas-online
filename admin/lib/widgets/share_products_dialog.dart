import 'package:flutter/material.dart';

import '../services/share_products_service.dart';
import '../theme/soft_theme.dart';

/// Pregunta qué contenido incluir al compartir la selección (nombre, imagen,
/// precio, descripción, variantes y especificaciones).
///
/// Devuelve la selección confirmada o null si el usuario cancela. La última
/// elección se recuerda vía SharedPreferences (la guarda quien llama).
Future<ShareFields?> showShareFieldsDialog(
  BuildContext context, {
  required int count,
  required ShareFields initial,
}) {
  var fields = initial;
  return showDialog<ShareFields>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setState) {
        Widget option(
          String label,
          String key,
          bool Function(ShareFields f) get,
        ) {
          return CheckboxListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: Text(label, style: const TextStyle(fontSize: 14)),
            value: get(fields),
            onChanged: (v) => setState(
              () => fields = _withKey(fields, key, v ?? true),
            ),
          );
        }

        return AlertDialog(
          title: Text(
            count == 1 ? 'Compartir producto' : 'Compartir $count productos',
          ),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '¿Qué quieres incluir? La próxima vez se recordará tu elección.',
                  style:
                      TextStyle(fontSize: 12, color: SoftTheme.textMuted),
                ),
                const SizedBox(height: 4),
                option('Nombre', 'name', (f) => f.name),
                option('Imagen de portada', 'image', (f) => f.image),
                option('Precio', 'price', (f) => f.price),
                option('Descripción', 'description', (f) => f.description),
                option('Variantes (nombre, precio, stock)', 'variants',
                    (f) => f.variants),
                option('Especificaciones (campo: valor)', 'specs',
                    (f) => f.specs),
                const SizedBox(height: 4),
                const Text(
                  'El link a la web se incluye solo al compartir 1 producto.',
                  style:
                      TextStyle(fontSize: 11, color: SoftTheme.textMuted),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancelar'),
            ),
            ElevatedButton.icon(
              icon: const Icon(Icons.share, size: 18),
              onPressed: () => Navigator.pop(ctx, fields),
              label: const Text('Compartir'),
            ),
          ],
        );
      },
    ),
  );
}

// Los ShareFields son inmutables; este helper arma la copia con un campo
// cambiado.
ShareFields _withKey(ShareFields f, String key, bool value) => ShareFields(
      name: key == 'name' ? value : f.name,
      image: key == 'image' ? value : f.image,
      price: key == 'price' ? value : f.price,
      description: key == 'description' ? value : f.description,
      variants: key == 'variants' ? value : f.variants,
      specs: key == 'specs' ? value : f.specs,
    );
