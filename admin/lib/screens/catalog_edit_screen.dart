import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../services/product_media_service.dart';
import '../theme/soft_theme.dart';

/// Pantalla para crear o editar un catálogo.
///
/// El ID del catálogo (slug) solo se puede definir al crearlo; después es inmutable.
class CatalogEditScreen extends StatefulWidget {
  const CatalogEditScreen({super.key, this.id, this.data});

  /// null → alta de catálogo nuevo.
  final String? id;
  final Map<String, dynamic>? data;

  @override
  State<CatalogEditScreen> createState() => _CatalogEditScreenState();
}

const _slugPattern = r'^[a-z0-9][a-z0-9-]{0,39}$';

class _CatalogEditScreenState extends State<CatalogEditScreen> {
  late final TextEditingController idCtrl;
  late final TextEditingController titleCtrl;
  late final TextEditingController minCtrl;
  late final TextEditingController prioCtrl;
  late final TextEditingController seoTitleCtrl;
  late final TextEditingController seoDescriptionCtrl;

  bool active = true;
  bool visible = true;
  bool saving = false;
  bool uploadingCover = false;
  String coverImageUrl = '';
  String? error;
  final _media = ProductMediaService();

  bool get isCreate => widget.id == null;

  @override
  void initState() {
    super.initState();
    final d = widget.data ?? {};
    idCtrl = TextEditingController(text: widget.id ?? '');
    titleCtrl = TextEditingController(text: d['title']?.toString() ?? '');
    coverImageUrl = d['coverImage']?.toString() ?? '';
    minCtrl = TextEditingController(text: '${d['minOrderSubtotal'] ?? 0}');
    prioCtrl = TextEditingController(text: '${d['priority'] ?? 0}');
    seoTitleCtrl = TextEditingController(text: d['seoTitle']?.toString() ?? '');
    seoDescriptionCtrl =
        TextEditingController(text: d['seoDescription']?.toString() ?? '');
    active = d['isActive'] != false;
    visible = d['isVisible'] != false;

    // Propuesta de slug desde el título mientras se crea.
    if (isCreate) {
      titleCtrl.addListener(() {
        if (idCtrl.text.isEmpty) {
          idCtrl.text = _slugify(titleCtrl.text);
        }
      });
    }
  }

  @override
  void dispose() {
    idCtrl.dispose();
    titleCtrl.dispose();
    minCtrl.dispose();
    prioCtrl.dispose();
    seoTitleCtrl.dispose();
    seoDescriptionCtrl.dispose();
    super.dispose();
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

  Future<void> _save() async {
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final id = isCreate ? idCtrl.text.trim() : widget.id!;
      if (!RegExp(_slugPattern).hasMatch(id)) {
        _showError(
            'El ID debe usar solo minúsculas, números y guiones.');
        return;
      }
      final title = titleCtrl.text.trim();
      if (title.isEmpty) {
        _showError('Ingresa el título del catálogo.');
        return;
      }
      if (coverImageUrl.trim().isEmpty) {
        _showError('Sube la imagen de portada.');
        return;
      }
      final min = double.tryParse(minCtrl.text.replaceAll(',', '.'));
      if (min == null || min < 0) {
        _showError('La compra mínima debe ser un número mayor o igual a 0.');
        return;
      }
      final priority = int.tryParse(prioCtrl.text.trim());
      if (priority == null) {
        _showError('La prioridad debe ser un número entero.');
        return;
      }

      final doc = <String, dynamic>{
        'title': title,
        'coverImage': coverImageUrl,
        'minOrderSubtotal': min,
        'priority': priority,
        'isActive': active,
        'isVisible': visible,
        'seoTitle': seoTitleCtrl.text.trim(),
        'seoDescription': seoDescriptionCtrl.text.trim(),
        'updatedAt': FieldValue.serverTimestamp(),
      };

      if (isCreate) {
        final ref = FirebaseFirestore.instance.collection('catalogs').doc(id);
        final snap = await ref.get();
        if (snap.exists) {
          _showError('Ya existe un catálogo con el ID "$id".');
          return;
        }
        await ref.set(doc);
      } else {
        await FirebaseFirestore.instance
            .collection('catalogs')
            .doc(id)
            .set(doc, SetOptions(merge: true));
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Catálogo guardado')),
        );
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      _showError('No se pudo guardar: $e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _uploadCover() async {
    final file =
        await ImagePicker().pickImage(source: ImageSource.gallery);
    if (file == null) return;
    setState(() {
      uploadingCover = true;
      error = null;
    });
    try {
      final previous = coverImageUrl;
      final url = await _media.uploadCatalogCover(file);
      if (previous.isNotEmpty && previous != url) {
        await _media.deleteByUrl(previous);
      }
      if (mounted) setState(() => coverImageUrl = url);
    } catch (e) {
      _showError('No se pudo subir la imagen: $e');
    } finally {
      if (mounted) setState(() => uploadingCover = false);
    }
  }

  Future<void> _removeCover() async {
    if (coverImageUrl.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Quitar imagen'),
        content: const Text(
            'Se borrará la imagen de portada.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Quitar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => uploadingCover = true);
    try {
      await _media.deleteByUrl(coverImageUrl);
      if (mounted) setState(() => coverImageUrl = '');
    } catch (e) {
      _showError('No se pudo quitar la imagen: $e');
    } finally {
      if (mounted) setState(() => uploadingCover = false);
    }
  }

  Future<void> _deleteCatalog() async {
    final id = widget.id;
    if (id == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar catálogo'),
        content: Text(
          'Se borrará "$id". Los productos de ese catálogo dejarán de verse en los listados.',
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
      if (coverImageUrl.isNotEmpty) {
        await _media.deleteByUrl(coverImageUrl);
      }
      await FirebaseFirestore.instance.collection('catalogs').doc(id).delete();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Catálogo eliminado')),
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
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(isCreate ? 'Nuevo catálogo' : 'Editar ${widget.id}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.save),
            tooltip: 'Guardar',
            onPressed: saving ? null : _save,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (error != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                border: Border.all(color: Colors.red.shade200),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(error!, style: TextStyle(color: Colors.red.shade800)),
            ),
            const SizedBox(height: 12),
          ],
          const Text('Datos del catálogo',
              style: TextStyle(fontWeight: FontWeight.bold)),
          if (isCreate)
            TextField(
              controller: idCtrl,
              decoration: const InputDecoration(
                labelText: 'Nombre corto (ID)',
                helperText: 'Minúsculas, sin espacios. Ej: hogar, tecnologia',
              ),
            )
          else
            TextField(
              controller: idCtrl,
              enabled: false,
              decoration: const InputDecoration(labelText: 'ID (no se puede cambiar)'),
            ),
          TextField(
            controller: titleCtrl,
            decoration: const InputDecoration(labelText: 'Título'),
          ),
          if (coverImageUrl.isNotEmpty)
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                coverImageUrl,
                height: 120,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) =>
                    const Icon(Icons.broken_image),
              ),
            ),
          const SizedBox(height: 8),
          const Text(
            'Sube una imagen desde tu dispositivo. Se verá en la portada del catálogo.',
            style: TextStyle(fontSize: 12),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              OutlinedButton.icon(
                onPressed: uploadingCover ? null : _uploadCover,
                icon: uploadingCover
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.upload),
                label: Text(coverImageUrl.isEmpty
                    ? 'Subir portada'
                    : 'Cambiar portada'),
              ),
              if (coverImageUrl.isNotEmpty) ...[
                const SizedBox(width: 8),
                TextButton.icon(
                  onPressed: uploadingCover ? null : _removeCover,
                  icon: const Icon(Icons.delete_outline, color: Colors.red),
                  label: const Text('Quitar',
                      style: TextStyle(color: Colors.red)),
                ),
              ],
            ],
          ),
          TextField(
            controller: minCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Compra mínima (COP)'),
          ),
          TextField(
            controller: prioCtrl,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Prioridad',
              helperText: 'Menor número = aparece primero',
            ),
          ),
          const SizedBox(height: 16),
          const Text('Visibilidad',
              style: TextStyle(fontWeight: FontWeight.bold)),
          SwitchListTile(
            title: const Text('Activo'),
            value: active,
            onChanged: (v) => setState(() => active = v),
          ),
          SwitchListTile(
            title: const Text('Visible en la web'),
            value: visible,
            onChanged: (v) => setState(() => visible = v),
          ),
          const SizedBox(height: 16),
          const Text('SEO (opcional)',
              style: TextStyle(fontWeight: FontWeight.bold)),
          TextField(
            controller: seoTitleCtrl,
            decoration: const InputDecoration(
              labelText: 'Título SEO',
              helperText: 'Si lo dejas vacío, se usa el título visible',
            ),
          ),
          TextField(
            controller: seoDescriptionCtrl,
            decoration: const InputDecoration(
              labelText: 'Descripción SEO',
              helperText: 'Resumen para buscadores y asistentes de IA',
            ),
            maxLines: 2,
          ),
          const SizedBox(height: 24),
          SoftTheme.fabButton(
            label: saving ? 'Guardando…' : 'Guardar catálogo',
            icon: Icons.save,
            onPressed: saving ? null : _save,
          ),
          if (!isCreate) ...[
            const SizedBox(height: 12),
            SoftTheme.fabDeleteButton(
              label: 'Eliminar catálogo',
              icon: Icons.delete_outline,
              onPressed: saving ? null : _deleteCatalog,
            ),
          ],
          const SizedBox(height: 32),
        ],
      ),
    );
  }
}
