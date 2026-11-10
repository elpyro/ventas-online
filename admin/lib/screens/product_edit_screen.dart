import '../theme/soft_theme.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import '../services/product_media_service.dart';
import '../utils/money.dart';

/// Monto en pesos colombianos, por ejemplo "$ 20.000".
const CopFormat _copFormat = CopFormat(decimals: 0);
String _cop(num? value) => _copFormat.format(value);

/// Pantalla completa para crear o editar un producto.
///
/// Incluye fotos, video, variantes con stock propio, especificaciones,
/// etiquetas y SEO. Los binarios se suben a Storage (ver storage.rules).
class ProductEditScreen extends StatefulWidget {
  const ProductEditScreen(
      {super.key, this.sku, this.data, this.initialCatalogId});

  /// null → alta de producto nuevo.
  final String? sku;
  final Map<String, dynamic>? data;

  /// Catálogo preseleccionado al crear desde el detalle del catálogo.
  final String? initialCatalogId;

  @override
  State<ProductEditScreen> createState() => _ProductEditScreenState();
}

class _VariantRow {
  _VariantRow({
    this.id,
    String color = '',
    String colorHex = '',
    String size = '',
    String price = '',
    String stock = '0',
  })  : colorCtrl = TextEditingController(text: color),
        hexCtrl = TextEditingController(text: colorHex),
        sizeCtrl = TextEditingController(text: size),
        priceCtrl = TextEditingController(text: price),
        stockCtrl = TextEditingController(text: stock);

  String? id;
  final TextEditingController colorCtrl;
  final TextEditingController hexCtrl;
  final TextEditingController sizeCtrl;
  final TextEditingController priceCtrl;
  final TextEditingController stockCtrl;

  void dispose() {
    colorCtrl.dispose();
    hexCtrl.dispose();
    sizeCtrl.dispose();
    priceCtrl.dispose();
    stockCtrl.dispose();
  }
}

class _SpecRow {
  _SpecRow({String label = '', String value = ''})
      : labelCtrl = TextEditingController(text: label),
        valueCtrl = TextEditingController(text: value);

  final TextEditingController labelCtrl;
  final TextEditingController valueCtrl;

  void dispose() {
    labelCtrl.dispose();
    valueCtrl.dispose();
  }
}

const _skuPattern = r'^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$';

class _ProductEditScreenState extends State<ProductEditScreen> {
  final media = ProductMediaService();

  late final TextEditingController skuCtrl;
  late final TextEditingController nameCtrl;
  late final TextEditingController brandCtrl;
  late final TextEditingController descriptionCtrl;
  late final TextEditingController priceCtrl;
  late final TextEditingController stockCtrl;
  late final TextEditingController priorityCtrl;
  late final TextEditingController tagsCtrl;
  late final TextEditingController seoTitleCtrl;
  late final TextEditingController seoDescriptionCtrl;

  final List<_VariantRow> variants = [];
  final List<_SpecRow> specs = [];
  final List<String> images = [];
  String videoUrl = '';

  final Set<String> selectedCatalogs = {};
  bool available = true;
  bool featured = false;

  bool saving = false;
  bool _generatingDesc = false;
  int pendingUploads = 0;
  String? error;

  bool get isCreate => widget.sku == null;

  @override
  void initState() {
    super.initState();
    final d = widget.data ?? {};
    skuCtrl = TextEditingController(text: widget.sku ?? '');
    nameCtrl = TextEditingController(text: d['name']?.toString() ?? '');
    brandCtrl = TextEditingController(text: d['brand']?.toString() ?? '');
    descriptionCtrl =
        TextEditingController(text: d['description']?.toString() ?? '');
    priceCtrl = TextEditingController(text: d['price']?.toString() ?? '');
    stockCtrl = TextEditingController(text: '${d['stock'] ?? 0}');
    priorityCtrl = TextEditingController(text: d['priority']?.toString() ?? '');
    tagsCtrl =
        TextEditingController(text: (d['tags'] as List?)?.join(', ') ?? '');
    seoTitleCtrl = TextEditingController(text: d['seoTitle']?.toString() ?? '');
    seoDescriptionCtrl =
        TextEditingController(text: d['seoDescription']?.toString() ?? '');

    available = d['isAvailable'] != false;
    featured = d['featured'] == true;
    videoUrl = d['videoUrl']?.toString() ?? '';
    images.addAll((d['images'] as List?)?.map((e) => e.toString()) ?? const []);
    selectedCatalogs.addAll(
        (d['catalogIds'] as List?)?.map((e) => e.toString()) ?? const []);
    // Al crear desde un catálogo, preseleccionar ese catálogo.
    if (isCreate && widget.initialCatalogId != null) {
      selectedCatalogs.add(widget.initialCatalogId!);
    }

    for (final raw in (d['variants'] as List?) ?? const []) {
      if (raw is! Map) continue;
      variants.add(_VariantRow(
        id: raw['id']?.toString(),
        color: raw['color']?.toString() ?? '',
        colorHex: raw['colorHex']?.toString() ?? '',
        size: raw['size']?.toString() ?? '',
        price: raw['price']?.toString() ?? '',
        stock: '${raw['stock'] ?? 0}',
      ));
    }
    for (final raw in (d['specs'] as List?) ?? const []) {
      if (raw is! Map) continue;
      specs.add(_SpecRow(
        label: raw['label']?.toString() ?? '',
        value: raw['value']?.toString() ?? '',
      ));
    }
  }

  @override
  void dispose() {
    skuCtrl.dispose();
    nameCtrl.dispose();
    brandCtrl.dispose();
    descriptionCtrl.dispose();
    priceCtrl.dispose();
    stockCtrl.dispose();
    priorityCtrl.dispose();
    tagsCtrl.dispose();
    seoTitleCtrl.dispose();
    seoDescriptionCtrl.dispose();
    for (final row in variants) {
      row.dispose();
    }
    for (final row in specs) {
      row.dispose();
    }
    super.dispose();
  }

  /// Achica la foto a miniatura (max 512px, JPEG q60) antes de mandarla a
  /// Gemini: solo necesita color/forma, no detalle. Evita payloads base64
  /// gigantes que disparan tokens y timeouts.
  Future<Uint8List?> _compressForGemini(Uint8List original) async {
    try {
      return await FlutterImageCompress.compressWithList(
        original,
        minWidth: 512,
        minHeight: 512,
        quality: 60,
        format: CompressFormat.jpeg,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _generateDescriptionWithAi() async {
    final name = nameCtrl.text.trim();
    final hasImage = images.isNotEmpty;
    if (name.isEmpty && !hasImage) {
      _showError('Necesitas nombre o foto principal para generar con IA.');
      return;
    }

    bool includeDesc = true;
    bool includeSeo = true;
    bool includeTags = true;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setDialog) {
            return AlertDialog(
              title: const Text('Generar con IA'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    hasImage
                        ? 'Se usará tu foto principal para describir el producto.'
                        : 'No hay foto principal: se generará solo con el nombre.',
                    style: const TextStyle(
                        fontSize: 12, color: SoftTheme.textMuted),
                  ),
                  CheckboxListTile(
                    value: includeDesc,
                    onChanged: (v) => setDialog(() => includeDesc = v ?? false),
                    title: const Text('Descripción'),
                    dense: true,
                  ),
                  CheckboxListTile(
                    value: includeSeo,
                    onChanged: (v) => setDialog(() => includeSeo = v ?? false),
                    title: const Text('Título y descripción SEO'),
                    dense: true,
                  ),
                  CheckboxListTile(
                    value: includeTags,
                    onChanged: (v) => setDialog(() => includeTags = v ?? false),
                    title: const Text('Etiquetas (coma, minúsculas)'),
                    dense: true,
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
                  child: const Text('Generar'),
                ),
              ],
            );
          },
        );
      },
    );
    if (confirmed != true) return;
    if (!includeDesc && !includeSeo && !includeTags) {
      _showError('Selecciona al menos un campo para generar.');
      return;
    }

    setState(() {
      _generatingDesc = true;
      error = null;
    });
    try {
      String? imageBase64;
      String? imageMimeType;
      if (hasImage) {
        try {
          final imgRes = await http.get(Uri.parse(images.first));
          if (imgRes.statusCode == 200 && imgRes.bodyBytes.isNotEmpty) {
            // Miniatura pequeñita para Gemini: no necesita detalle.
            final compressed = await _compressForGemini(imgRes.bodyBytes);
            if (compressed != null) {
              imageBase64 = base64Encode(compressed);
              imageMimeType = 'image/jpeg';
            } else {
              imageBase64 = base64Encode(imgRes.bodyBytes);
              final ct = imgRes.headers['content-type'] ?? 'image/jpeg';
              imageMimeType = ct.split(';').first.trim().toLowerCase();
              if (!['image/jpeg', 'image/png', 'image/webp']
                  .contains(imageMimeType)) {
                imageMimeType = 'image/jpeg';
              }
            }
          }
        } catch (_) {
          // Sin imagen por fallo de red: continúa solo con el nombre.
        }
      }

      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      final url = Uri.parse(
          'https://us-central1-ventas-online-ec.cloudfunctions.net/generateProductDescription');
      final res = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          if (token != null) 'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'data': {
            'name': name,
            'brand': brandCtrl.text.trim(),
            'category':
                selectedCatalogs.isNotEmpty ? selectedCatalogs.first : '',
            'tone': 'profesional',
            if (imageBase64 != null && imageMimeType != null) ...{
              'imageBase64': imageBase64,
              'imageMimeType': imageMimeType,
            },
            'includeDescription': includeDesc,
            'includeSeo': includeSeo,
            'includeTags': includeTags,
          }
        }),
      );
      if (res.statusCode != 200) {
        throw Exception('Error ${res.statusCode}: ${res.body}');
      }
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      final result = (json['result'] as Map?) ?? json;
      if (mounted) {
        if (includeDesc) {
          final desc = result['description']?.toString() ?? '';
          if (desc.isNotEmpty) descriptionCtrl.text = desc;
        }
        if (includeSeo) {
          final t = result['seoTitle']?.toString() ?? '';
          final d = result['seoDescription']?.toString() ?? '';
          if (t.isNotEmpty) seoTitleCtrl.text = t;
          if (d.isNotEmpty) seoDescriptionCtrl.text = d;
        }
        if (includeTags) {
          final tg = result['tags']?.toString() ?? '';
          if (tg.isNotEmpty) tagsCtrl.text = tg;
        }
        SoftTheme.showSnack(context, 'Texto generado con IA',
            type: SnackType.success);
      }
    } catch (e) {
      if (mounted) {
        SoftTheme.showSnack(context, 'No se pudo generar: $e',
            type: SnackType.error);
      }
    } finally {
      if (mounted) setState(() => _generatingDesc = false);
    }
  }

  // ------------------------------------------------------------------
  // Subida de medios
  // ------------------------------------------------------------------
  Future<void> _pickAndUploadImages() async {
    final sku = _effectiveSku();
    if (sku == null) {
      _showError('Completa el SKU antes de subir fotos.');
      return;
    }
    // Preguntar si tomar foto o buscarla en el dispositivo.
    final source = await showDialog<ImageSource>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Agregar fotos'),
        content: const Text('Elige cómo quieres agregar la foto:'),
        actions: [
          TextButton.icon(
            onPressed: () => Navigator.pop(ctx, ImageSource.camera),
            icon: const Icon(Icons.photo_camera),
            label: const Text('Tomar foto'),
          ),
          TextButton.icon(
            onPressed: () => Navigator.pop(ctx, ImageSource.gallery),
            icon: const Icon(Icons.photo_library),
            label: const Text('Buscar en el dispositivo'),
          ),
        ],
      ),
    );
    if (source == null) return;
    final files = await media.pickImagesFrom(source);
    if (files.isEmpty) return;
    setState(() => pendingUploads += files.length);
    try {
      for (final file in files) {
        final url = await media.uploadProductImage(sku, file);
        if (!mounted) return;
        setState(() => images.add(url));
      }
    } catch (e) {
      _showError('No se pudo subir una foto: $e');
    } finally {
      if (mounted) setState(() => pendingUploads -= files.length);
    }
  }

  Future<void> _pickAndUploadVideo() async {
    final sku = _effectiveSku();
    if (sku == null) {
      _showError('Completa el SKU antes de subir el video.');
      return;
    }
    final file = await media.pickVideo();
    if (file == null) return;
    setState(() => pendingUploads += 1);
    try {
      final url = await media.uploadProductVideo(sku, file);
      if (!mounted) return;
      if (videoUrl.isNotEmpty) {
        await media.deleteByUrl(videoUrl);
      }
      setState(() => videoUrl = url);
    } catch (e) {
      _showError('No se pudo subir el video: $e');
    } finally {
      if (mounted) setState(() => pendingUploads -= 1);
    }
  }

  String? _effectiveSku() {
    if (widget.sku != null) return widget.sku;
    final sku = skuCtrl.text.trim().toUpperCase();
    return RegExp(_skuPattern).hasMatch(sku) ? sku : null;
  }

  // ------------------------------------------------------------------
  // Guardar / eliminar
  // ------------------------------------------------------------------
  Future<void> _save() async {
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final d = _buildDocument();
      if (d == null) return; // ya mostró el error
      final sku = d['sku'] as String;

      if (isCreate) {
        final ref = FirebaseFirestore.instance.collection('products').doc(sku);
        final snap = await ref.get();
        if (snap.exists) {
          _showError('Ya existe un producto con el SKU $sku.');
          return;
        }
        await ref.set(d);
      } else {
        await FirebaseFirestore.instance
            .collection('products')
            .doc(sku)
            .set(d, SetOptions(merge: true));
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Producto guardado')),
        );
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      // El detalle técnico va aparte para que el usuario vea algo entendible.
      _showError(
          'No se pudo guardar el producto. Revisa tu conexión e inténtalo otra vez.\n\nDetalle: $e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  /// Escribe [field] en [doc] con [value]; si el valor viene vacío, al editar
  /// marca el campo para borrarse y al crear lo omite.
  void _setOrDelete(Map<String, dynamic> doc, String field, Object? value) {
    if (value != null) {
      doc[field] = value;
    } else if (!isCreate) {
      doc[field] = FieldValue.delete();
    }
  }

  Map<String, dynamic>? _buildDocument() {
    final sku = _effectiveSku();
    if (sku == null) {
      _showError(
          'SKU inválido: usa letras, números, guion, punto o guion bajo.');
      return null;
    }
    final name = nameCtrl.text.trim();
    if (name.isEmpty) {
      _showError('Ingresa el nombre del producto.');
      return null;
    }
    if (selectedCatalogs.isEmpty) {
      _showError('Selecciona al menos un catálogo.');
      return null;
    }
    final price = double.tryParse(priceCtrl.text.replaceAll(',', '.'));
    if (price == null || price < 0) {
      _showError('Ingresa un precio válido (mayor o igual a 0).');
      return null;
    }

    // Variantes: validar y calcular stock total.
    final parsedVariants = <Map<String, dynamic>>[];
    final ids = <String>{};
    int stockFromVariants = 0;
    for (var i = 0; i < variants.length; i++) {
      final row = variants[i];
      final color = row.colorCtrl.text.trim();
      final size = row.sizeCtrl.text.trim();
      final priceText = row.priceCtrl.text.trim();
      final stockText = row.stockCtrl.text.trim();
      final empty = color.isEmpty &&
          size.isEmpty &&
          priceText.isEmpty &&
          (stockText.isEmpty || stockText == '0');
      if (empty) continue;

      if (color.isEmpty && size.isEmpty) {
        _showError('La variante ${i + 1} necesita color o talla.');
        return null;
      }
      final stock = int.tryParse(stockText);
      if (stock == null || stock < 0) {
        _showError('La variante ${i + 1} tiene un stock inválido.');
        return null;
      }
      double? variantPrice;
      if (priceText.isNotEmpty) {
        final parsed = double.tryParse(priceText.replaceAll(',', '.'));
        if (parsed == null || parsed < 0) {
          _showError('La variante ${i + 1} tiene un precio inválido.');
          return null;
        }
        variantPrice = parsed;
      }
      var id = _slugify('${color.isNotEmpty ? color : 'op'}-$size');
      if (id.isEmpty) id = 'var-$i';
      while (ids.contains(id)) {
        id = '$id-${i}';
      }
      ids.add(id);

      final variant = <String, dynamic>{'id': id, 'stock': stock};
      if (color.isNotEmpty) variant['color'] = color;
      if (row.hexCtrl.text.trim().isNotEmpty)
        variant['colorHex'] = row.hexCtrl.text.trim();
      if (size.isNotEmpty) variant['size'] = size;
      if (variantPrice != null) variant['price'] = variantPrice;
      parsedVariants.add(variant);
      stockFromVariants += stock;
    }

    int stock = stockFromVariants;
    if (parsedVariants.isEmpty) {
      final parsedStock = int.tryParse(stockCtrl.text.trim());
      if (parsedStock == null || parsedStock < 0) {
        _showError('Ingresa un stock válido (entero mayor o igual a 0).');
        return null;
      }
      stock = parsedStock;
    }

    final parsedSpecs = specs
        .map((s) => {
              'label': s.labelCtrl.text.trim(),
              'value': s.valueCtrl.text.trim(),
            })
        .where((s) =>
            (s['label'] as String).isNotEmpty &&
            (s['value'] as String).isNotEmpty)
        .toList();

    final tags = tagsCtrl.text
        .split(',')
        .map((t) => t.trim())
        .where((t) => t.isNotEmpty)
        .toSet()
        .toList();

    final priorityRaw = priorityCtrl.text.trim();
    final priority = priorityRaw.isEmpty ? 0 : int.tryParse(priorityRaw);
    if (priority == null || priority < 0) {
      _showError(
          'Ingresa un orden válido (número entero mayor o igual a 0). Menor = aparece primero.');
      return null;
    }

    final doc = <String, dynamic>{
      'sku': sku,
      'name': name,
      'brand': brandCtrl.text.trim(),
      'description': descriptionCtrl.text.trim(),
      'price': price,
      'stock': stock,
      'priority': priority,
      // Stock 0 = agotado (no desactiva el flag); el flag solo oculta en web.
      'isAvailable': available,
      'catalogIds': selectedCatalogs.toList()..sort(),
      'images': images,
      'featured': featured,
      'seoTitle': seoTitleCtrl.text.trim(),
      'seoDescription': seoDescriptionCtrl.text.trim(),
      'updatedAt': FieldValue.serverTimestamp(),
    };

    // Al crear no se puede usar FieldValue.delete() (solo vale con update() o
    // set() con merge): el campo vacío simplemente no se escribe. Al editar sí
    // se borra el campo para que no quede el valor viejo.
    _setOrDelete(
        doc, 'variants', parsedVariants.isNotEmpty ? parsedVariants : null);
    _setOrDelete(doc, 'specs', parsedSpecs.isNotEmpty ? parsedSpecs : null);
    _setOrDelete(doc, 'tags', tags.isNotEmpty ? tags : null);
    _setOrDelete(doc, 'videoUrl', videoUrl.isNotEmpty ? videoUrl : null);
    if (isCreate) doc['createdAt'] = FieldValue.serverTimestamp();
    return doc;
  }

  Future<void> _deleteProduct() async {
    final sku = widget.sku;
    if (sku == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar producto'),
        content: Text(
          'Se eliminará $sku de la tienda y sus fotos y video. Los pedidos ya creados conservan el nombre y el precio.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => saving = true);
    try {
      for (final url in [...images, if (videoUrl.isNotEmpty) videoUrl]) {
        await media.deleteByUrl(url);
      }
      await FirebaseFirestore.instance.collection('products').doc(sku).delete();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Producto eliminado')),
        );
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      _showError('No se pudo eliminar: $e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    setState(() {
      error = message;
      saving = false;
    });
    // Las advertencias también salen en toast para no depender solo del recuadro.
    SoftTheme.showSnack(context, message, type: SnackType.error);
  }

  Future<void> _duplicateAsNew() async {
    // Duplica el producto actual como nuevo: limpia SKU, pone "copia" en el
    // nombre y conserva fotos/variantes/catálogos.
    final duplicate =
        Map<String, dynamic>.from(widget.data ?? const <String, dynamic>{});
    duplicate['name'] = '${duplicate['name']?.toString() ?? 'Producto'} copia';
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ProductEditScreen(data: duplicate),
      ),
    );
  }

  String _slugify(String value) {
    const replacements = {
      'á': 'a',
      'é': 'e',
      'í': 'i',
      'ó': 'o',
      'ú': 'u',
      'Á': 'a',
      'É': 'e',
      'Í': 'i',
      'Ó': 'o',
      'Ú': 'u',
      'ñ': 'n',
      'Ñ': 'n',
    };
    var s = value.toLowerCase().trim();
    replacements.forEach((k, v) => s = s.replaceAll(k, v));
    s = s.replaceAll(RegExp(r'[^a-z0-9]+'), '-');
    s = s.replaceAll(RegExp(r'^-+|-+$'), '');
    return s.length > 40
        ? s.substring(0, 40).replaceAll(RegExp(r'-+$'), '')
        : s;
  }

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SoftTheme.background,
      appBar: AppBar(
        title: Text(isCreate ? 'Nuevo producto' : 'Editar ${widget.sku}'),
        actions: [
          if (!isCreate)
            IconButton(
              icon: const Icon(Icons.copy),
              tooltip: 'Duplicar como nuevo',
              onPressed: saving ? null : _duplicateAsNew,
            ),
          IconButton(
            icon: const Icon(Icons.save),
            tooltip: 'Guardar',
            onPressed: saving ? null : _save,
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream:
                  FirebaseFirestore.instance.collection('catalogs').snapshots(),
              builder: (context, snap) {
                final catalogDocs = snap.data?.docs ?? [];
                return ListView(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
                  children: [
                    if (error != null) ...[
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.red.shade50,
                          border: Border.all(color: Colors.red.shade200),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(error!,
                            style: TextStyle(color: Colors.red.shade800)),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // ---------------- Fotos y video (antes del nombre) ----------------
                    _SectionTitle('Fotos (${images.length})'),
                    if (images.isNotEmpty)
                      GridView.count(
                        crossAxisCount: 3,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                        children: [
                          for (var i = 0; i < images.length; i++)
                            _ImageTile(
                              url: images[i],
                              isCover: i == 0,
                              onSetCover: () => setState(() {
                                final u = images.removeAt(i);
                                images.insert(0, u);
                              }),
                              onDelete: () async {
                                final url = images[i];
                                setState(() => images.removeAt(i));
                                await media.deleteByUrl(url);
                              },
                            ),
                        ],
                      ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed:
                          pendingUploads > 0 ? null : _pickAndUploadImages,
                      icon: const Icon(Icons.add_photo_alternate),
                      label: Text(
                          pendingUploads > 0 ? 'Subiendo…' : 'Agregar fotos'),
                    ),
                    const SizedBox(height: 28),
                    const _SectionTitle('Video (opcional)'),
                    if (videoUrl.isNotEmpty)
                      Card(
                        child: ListTile(
                          leading: const Icon(Icons.play_circle_fill, size: 40),
                          title: const Text('Video cargado'),
                          subtitle: Text(videoUrl,
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline),
                            tooltip: 'Quitar video',
                            onPressed: () async {
                              final url = videoUrl;
                              setState(() => videoUrl = '');
                              await media.deleteByUrl(url);
                            },
                          ),
                        ),
                      )
                    else
                      OutlinedButton.icon(
                        onPressed:
                            pendingUploads > 0 ? null : _pickAndUploadVideo,
                        icon: const Icon(Icons.video_library),
                        label: const Text('Subir video (máx. 60 s, 25 MB)'),
                      ),

                    // ---------------- Datos básicos ----------------
                    const SizedBox(height: 28),
                    const _SectionTitle('Datos básicos'),
                    if (isCreate)
                      TextField(
                        controller: skuCtrl,
                        decoration: const InputDecoration(
                          labelText: 'Código del producto (SKU)',
                          helperText:
                              'Letras, números, guion, punto o guion bajo. No podrás cambiarlo.',
                        ),
                        textCapitalization: TextCapitalization.characters,
                      )
                    else
                      TextField(
                        controller: skuCtrl,
                        enabled: false,
                        decoration: const InputDecoration(labelText: 'Código (SKU)'),
                      ),
                    TextField(
                      controller: nameCtrl,
                      decoration: const InputDecoration(
                          labelText: 'Nombre del producto'),
                    ),
                    TextField(
                      controller: brandCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Marca',
                        helperText: 'Ej: SoundMax',
                      ),
                    ),
                    TextField(
                      controller: descriptionCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Descripción',
                        helperText: 'Texto que verá el cliente en la ficha',
                      ),
                      maxLines: 4,
                    ),
                    const SizedBox(height: 8),
                    SoftTheme.fabButton(
                      label: _generatingDesc
                          ? 'Generando…'
                          : 'Generar descripción con IA',
                      icon: Icons.auto_awesome,
                      onPressed:
                          _generatingDesc ? null : _generateDescriptionWithAi,
                    ),

                    // ---------------- Precio y stock ----------------
                    const SizedBox(height: 28),
                    const _SectionTitle('Precio y stock'),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: priceCtrl,
                            keyboardType: const TextInputType.numberWithOptions(
                                decimal: true),
                            decoration: const InputDecoration(
                                labelText: 'Precio COP'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: stockCtrl,
                            enabled: variants.isEmpty,
                            keyboardType: TextInputType.number,
                            decoration: InputDecoration(
                              labelText: 'Stock',
                              helperText: variants.isEmpty
                                  ? null
                                  : 'Se calcula por variantes',
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: TextField(
                            controller: priorityCtrl,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Orden visible',
                              helperText: 'Menor = aparece primero en la web',
                            ),
                          ),
                        ),
                      ],
                    ),
                    SwitchListTile(
                      contentPadding: const EdgeInsets.all(4),
                      title: const Text('Disponible para la venta'),
                      value: available,
                      onChanged: (v) => setState(() => available = v),
                    ),
                    SwitchListTile(
                      contentPadding: const EdgeInsets.all(4),
                      title: const Text(
                          'Destacado (aparece como oferta en la home)'),
                      value: featured,
                      onChanged: (v) => setState(() => featured = v),
                    ),

                    // ---------------- Catálogos ----------------
                    const SizedBox(height: 28),
                    const _SectionTitle('Catálogos'),
                    if (catalogDocs.isEmpty)
                      const Text(
                          'Aún no hay catálogos. Créalos en la pestaña Catálogos.'),
                    ...catalogDocs.map((doc) {
                      final data = doc.data() as Map<String, dynamic>;
                      final id = doc.id;
                      final selected = selectedCatalogs.contains(id);
                      return CheckboxListTile(
                        contentPadding: const EdgeInsets.all(4),
                        value: selected,
                        title: Text(data['title']?.toString() ?? id),
                        subtitle: Text(
                            'ID $id · Compra mínima ${_cop(data['minOrderSubtotal'] as num?)}'),
                        onChanged: (v) => setState(() {
                          if (v == true) {
                            selectedCatalogs.add(id);
                          } else {
                            selectedCatalogs.remove(id);
                          }
                        }),
                      );
                    }),

                    // ---------------- Variantes ----------------
                    const SizedBox(height: 28),
                    const _SectionTitle('Variantes con stock propio'),
                    const Text(
                      'Ej: color Negro / talla M. Si hay variantes, el stock del producto se calcula solo.',
                      style: TextStyle(fontSize: 12),
                    ),
                    const SizedBox(height: 8),
                    for (var i = 0; i < variants.length; i++)
                      _VariantCard(
                        index: i,
                        row: variants[i],
                        onDelete: () =>
                            setState(() => variants.removeAt(i).dispose()),
                      ),
                    OutlinedButton.icon(
                      onPressed: () =>
                          setState(() => variants.add(_VariantRow())),
                      icon: const Icon(Icons.add),
                      label: const Text('Agregar variante'),
                    ),
                    if (variants.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(
                          'Stock total de variantes: ${variants.fold<int>(0, (sum, v) => sum + (int.tryParse(v.stockCtrl.text.trim()) ?? 0))}',
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                      ),

                    // ---------------- Especificaciones ----------------
                    const SizedBox(height: 28),
                    const _SectionTitle('Especificaciones'),
                    const Text(
                      'Material, garantía, medidas, peso… Lo que quieras mostrar en la ficha.',
                      style: TextStyle(fontSize: 12),
                    ),
                    const SizedBox(height: 8),
                    for (var i = 0; i < specs.length; i++)
                      _SpecCard(
                        row: specs[i],
                        onDelete: () =>
                            setState(() => specs.removeAt(i).dispose()),
                      ),
                    OutlinedButton.icon(
                      onPressed: () => setState(() => specs.add(_SpecRow())),
                      icon: const Icon(Icons.add),
                      label: const Text('Agregar especificación'),
                    ),

                    // ---------------- Etiquetas y SEO ----------------
                    const SizedBox(height: 28),
                    const _SectionTitle('Búsqueda y SEO'),
                    TextField(
                      controller: tagsCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Etiquetas',
                        helperText:
                            'Separadas por coma. Ej: audífonos, bluetooth',
                      ),
                    ),
                    TextField(
                      controller: seoTitleCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Título SEO (vacío = nombre del producto)',
                      ),
                    ),
                    TextField(
                      controller: seoDescriptionCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Descripción SEO',
                        helperText:
                            'Resumen para buscadores y asistentes de IA',
                      ),
                      maxLines: 2,
                    ),
                  ],
                );
              },
            ),
          ),
          _buildFooterActions(),
        ],
      ),
    );
  }

  /// Acciones de guardar/eliminar fijadas al fondo de la pantalla (fuera del
  /// scroll) para que siempre sean visibles y tappeables en pantallas móviles.
  Widget _buildFooterActions() {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SoftTheme.fabButton(
              label: saving ? 'Guardando…' : 'Guardar producto',
              icon: Icons.save,
              onPressed: saving ? null : _save,
            ),
            if (!isCreate) ...[
              const SizedBox(height: 8),
              SoftTheme.fabDeleteButton(
                label: 'Eliminar producto',
                icon: Icons.delete_outline,
                onPressed: saving ? null : _deleteProduct,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
      ),
    );
  }
}

class _ImageTile extends StatelessWidget {
  const _ImageTile({
    required this.url,
    required this.isCover,
    required this.onSetCover,
    required this.onDelete,
  });

  final String url;
  final bool isCover;
  final VoidCallback onSetCover;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => showDialog<void>(
        context: context,
        builder: (_) => Dialog(
          backgroundColor: Colors.transparent,
          insetPadding: const EdgeInsets.all(16),
          child: GestureDetector(
            onTap: () => Navigator.pop(context),
            child: InteractiveViewer(
              child: Image.network(url, fit: BoxFit.contain),
            ),
          ),
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.network(
              url,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const ColoredBox(
                color: Color(0xFFE2E8F0),
                child: Icon(Icons.broken_image),
              ),
            ),
          ),
          Positioned(
            right: 2,
            top: 2,
            child: Row(
              children: [
                IconButton(
                  icon: Icon(
                    Icons.star,
                    size: 20,
                    color: isCover ? const Color(0xFFFBBF24) : Colors.white,
                  ),
                  tooltip: 'Usar como portada',
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.black45,
                    padding: const EdgeInsets.all(4),
                  ),
                  onPressed: onSetCover,
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline,
                      size: 20, color: Colors.white),
                  tooltip: 'Quitar foto',
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.black45,
                    padding: const EdgeInsets.all(4),
                  ),
                  onPressed: onDelete,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _VariantCard extends StatelessWidget {
  const _VariantCard({
    required this.index,
    required this.row,
    required this.onDelete,
  });

  final int index;
  final _VariantRow row;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          children: [
            Row(
              children: [
                Text('Variante ${index + 1}',
                    style: const TextStyle(fontWeight: FontWeight.bold)),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  tooltip: 'Quitar',
                  onPressed: onDelete,
                ),
              ],
            ),
            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: TextField(
                    controller: row.colorCtrl,
                    decoration: const InputDecoration(labelText: 'Color'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: TextField(
                    controller: row.hexCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Código de color',
                      helperText: 'Ej. #111111',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: TextField(
                    controller: row.sizeCtrl,
                    decoration: const InputDecoration(labelText: 'Talla'),
                  ),
                ),
              ],
            ),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: row.priceCtrl,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Precio',
                      helperText: 'Si lo dejas vacío, usa el precio base',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: row.stockCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Stock'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SpecCard extends StatelessWidget {
  const _SpecCard({required this.row, required this.onDelete});

  final _SpecRow row;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(
          children: [
            Expanded(
              flex: 2,
              child: TextField(
                controller: row.labelCtrl,
                decoration: const InputDecoration(labelText: 'Campo'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 3,
              child: TextField(
                controller: row.valueCtrl,
                decoration: const InputDecoration(labelText: 'Valor'),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.close, size: 18),
              tooltip: 'Quitar',
              onPressed: onDelete,
            ),
          ],
        ),
      ),
    );
  }
}
