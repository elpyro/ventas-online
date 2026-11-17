import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../utils/money.dart';

/// URL pública de la tienda (las fichas de producto viven ahí).
const String kSiteUrl = 'https://celtoons.com';

/// Datos mínimos de un producto para armar el mensaje de compartir.
class ShareProduct {
  const ShareProduct({required this.sku, required this.data});

  final String sku;
  final Map<String, dynamic> data;
}

/// Qué contenido debe incluir el mensaje. El orden de los campos coincide con
/// el diálogo de la multiselección.
class ShareFields {
  const ShareFields({
    this.name = true,
    this.image = false,
    this.price = true,
    this.description = false,
    this.variants = false,
    this.specs = false,
  });

  final bool name;
  final bool image;
  final bool price;
  final bool description;
  final bool variants;
  final bool specs;

  static const _prefsKey = 'share_fields_v1';

  List<String> toKeys() => [
        if (name) 'name',
        if (image) 'image',
        if (price) 'price',
        if (description) 'description',
        if (variants) 'variants',
        if (specs) 'specs',
      ];

  factory ShareFields.fromKeys(List<String> keys) {
    final set = keys.toSet();
    return ShareFields(
      name: set.contains('name'),
      image: set.contains('image'),
      price: set.contains('price'),
      description: set.contains('description'),
      variants: set.contains('variants'),
      specs: set.contains('specs'),
    );
  }
}

const ShareFields _defaultShareFields = ShareFields();

/// Última selección guardada en el dispositivo (nada sensible: solo qué
/// casillas estaban marcadas).
Future<ShareFields> loadShareFields() async {
  final prefs = await SharedPreferences.getInstance();
  final keys = prefs.getStringList(ShareFields._prefsKey);
  if (keys == null) return _defaultShareFields;
  return ShareFields.fromKeys(keys);
}

Future<void> saveShareFields(ShareFields fields) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setStringList(ShareFields._prefsKey, fields.toKeys());
}

const CopFormat _cop = CopFormat();

String _clean(dynamic v) => v?.toString().trim() ?? '';

String _variantLabel(Map<dynamic, dynamic> variant) {
  return [variant['color'], variant['size']]
      .map(_clean)
      .where((s) => s.isNotEmpty)
      .join(' / ');
}

/// Arma el mensaje: un bloque por producto, separados por línea en blanco.
/// El link a la ficha solo se incluye cuando hay exactamente un producto.
String buildShareMessage(List<ShareProduct> products, ShareFields fields) {
  final single = products.length == 1;
  final blocks = <String>[];

  for (final p in products) {
    final d = p.data;
    final name = _clean(d['name']).isNotEmpty ? _clean(d['name']) : p.sku;
    final price = (d['price'] as num?)?.toDouble() ?? 0;
    final lines = <String>[];

    if (fields.name) lines.add(name);
    if (fields.price) lines.add('Precio: ${_cop.format(price)}');
    if (fields.description) {
      final desc = _clean(d['description']);
      if (desc.isNotEmpty) lines.add(desc);
    }
    if (fields.variants) {
      final variants = (d['variants'] as List?) ?? const [];
      final parts = <String>[];
      for (final raw in variants) {
        if (raw is! Map) continue;
        var label = _variantLabel(raw);
        if (label.isEmpty) {
          final id = _clean(raw['id']);
          label = id.isEmpty ? 'Variante' : id;
        }
        final variantPrice = (raw['price'] as num?)?.toDouble() ?? price;
        final stock = (raw['stock'] as num?)?.toInt() ?? 0;
        parts.add(
          '$label · ${_cop.format(variantPrice)} · ${stock > 0 ? '$stock und' : 'agotado'}',
        );
      }
      if (parts.isNotEmpty) lines.add('Variantes: ${parts.join('; ')}');
    }
    if (fields.specs) {
      final specs = (d['specs'] as List?) ?? const [];
      final parts = <String>[];
      for (final raw in specs) {
        if (raw is! Map) continue;
        final label = _clean(raw['label']);
        final value = _clean(raw['value']);
        if (label.isNotEmpty && value.isNotEmpty) {
          parts.add('$label: $value');
        }
      }
      if (parts.isNotEmpty) lines.add('Especificaciones: ${parts.join('; ')}');
    }
    if (single) lines.add('$kSiteUrl/producto/${Uri.encodeComponent(p.sku)}');
    // Nunca un mensaje vacío: si no se marcó nada, al menos el nombre.
    if (lines.isEmpty) lines.add(name);

    blocks.add(lines.join('\n'));
  }

  return blocks.join('\n\n');
}

/// Resultado de descargar las portadas: archivos listos para adjuntar y los
/// SKUs cuya imagen no se pudo bajar (sin portada, red caída, etc.).
typedef CoverDownload = ({List<String> paths, List<String> failed});

/// Baja la imagen de portada (primera de `images`) de cada producto a un
/// directorio temporal. Los que fallan se reportan; el texto se comparte igual.
Future<CoverDownload> downloadCovers(List<ShareProduct> products) async {
  final temp = await getTemporaryDirectory();
  final dir = Directory(
    '${temp.path}${Platform.pathSeparator}share_covers_${DateTime.now().millisecondsSinceEpoch}',
  );
  await dir.create(recursive: true);

  final paths = <String>[];
  final failed = <String>[];
  final client = http.Client();
  try {
    for (final p in products) {
      final images = (p.data['images'] as List?)?.whereType<String>().toList() ??
          const <String>[];
      if (images.isEmpty) {
        failed.add(p.sku);
        continue;
      }
      final url = images.first;
      try {
        final res = await client
            .get(Uri.parse(url))
            .timeout(const Duration(seconds: 20));
        if (res.statusCode != 200) {
          failed.add(p.sku);
          continue;
        }
        final ext = _extensionFromUrl(url) ?? 'jpg';
        final safe = p.sku.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '-');
        final file =
            File('${dir.path}${Platform.pathSeparator}celtoons-$safe.$ext');
        await file.writeAsBytes(res.bodyBytes);
        paths.add(file.path);
      } catch (_) {
        failed.add(p.sku);
      }
    }
  } finally {
    client.close();
  }
  return (paths: paths, failed: failed);
}

String? _extensionFromUrl(String url) {
  final path = Uri.tryParse(url)?.path ?? '';
  final dot = path.lastIndexOf('.');
  if (dot < 0 || dot >= path.length - 1) return null;
  final ext = path.substring(dot + 1).toLowerCase();
  return RegExp(r'^[a-z0-9]{2,5}$').hasMatch(ext) ? ext : null;
}
