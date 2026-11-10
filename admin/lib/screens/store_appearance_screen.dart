import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../services/product_media_service.dart';
import '../theme/soft_theme.dart';
import '../widgets/soft_section.dart';

/// Campos editables de un badge del hero (título + texto del cuadro).
class _HeroBadgeField {
  _HeroBadgeField({required this.text, required this.description});
  final TextEditingController text;
  final TextEditingController description;
}

/// Campos editables de una pregunta frecuente (pregunta + respuesta).
class _FaqField {
  _FaqField({required this.question, required this.answer});
  final TextEditingController question;
  final TextEditingController answer;
}

/// Apariencia visual de la web: enunciado de la home, badges del hero,
/// preguntas frecuentes, colores del tema y banners.
///
/// Pantalla independiente: carga y guarda sus propios campos para que la
/// pantalla principal de Config quede corta y sin riesgo de pisar datos.
class StoreAppearanceScreen extends StatefulWidget {
  const StoreAppearanceScreen({super.key});

  @override
  State<StoreAppearanceScreen> createState() => _StoreAppearanceScreenState();
}

class _StoreAppearanceScreenState extends State<StoreAppearanceScreen> {
  final sloganCtrl = TextEditingController();
  final List<_HeroBadgeField> heroBadges = [];
  final List<_FaqField> faqs = [];
  final List<Map<String, dynamic>> banners = [];
  final _media = ProductMediaService();

  bool loaded = false;
  bool saving = false;
  bool savingBanners = false;
  /// Si `faqs` ya existía en Firestore, guardar una lista vacía sí borra las
  /// preguntas. Si no existía, no escribimos el campo para no ocultar las de
  /// ejemplo de la web.
  bool hadFaqsField = false;

  Color _primary = const Color(0xFF10B981);
  Color _primaryDark = const Color(0xFF047857);
  Color _primarySoft = const Color(0xFFECFDF5);
  Color _background = const Color(0xFFF0F4F8);
  Color _surface = const Color(0xFFFFFFFF);
  Color _text = const Color(0xFF1E293B);
  Color _textMuted = const Color(0xFF64748B);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    sloganCtrl.dispose();
    for (final b in heroBadges) {
      b.text.dispose();
      b.description.dispose();
    }
    for (final f in faqs) {
      f.question.dispose();
      f.answer.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final snap = await FirebaseFirestore.instance
        .collection('store_config')
        .doc('general')
        .get();
    final data = snap.data() ?? {};
    sloganCtrl.text = data['slogan']?.toString() ?? '';
    _primary = _parseHex(data['themePrimary'], _primary);
    _primaryDark = _parseHex(data['themePrimaryDark'], _primaryDark);
    _primarySoft = _parseHex(data['themePrimarySoft'], _primarySoft);
    _background = _parseHex(data['themeBackground'], _background);
    _surface = _parseHex(data['themeSurface'], _surface);
    _text = _parseHex(data['themeText'], _text);
    _textMuted = _parseHex(data['themeTextMuted'], _textMuted);

    final heroRaw = (data['heroBadges'] as List?) ?? const [];
    heroBadges.clear();
    for (final b in heroRaw) {
      if (b is Map) {
        heroBadges.add(_HeroBadgeField(
          text: TextEditingController(
              text: (b['text'] ?? b['title'] ?? '').toString()),
          description:
              TextEditingController(text: (b['description'] ?? '').toString()),
        ));
      } else if (b != null) {
        heroBadges.add(_HeroBadgeField(
          text: TextEditingController(text: b.toString()),
          description: TextEditingController(),
        ));
      }
    }
    if (heroBadges.isEmpty) {
      heroBadges.add(_HeroBadgeField(
          text: TextEditingController(), description: TextEditingController()));
    }

    // Se aceptan varias formas por compatibilidad: {question, answer},
    // {q, a} o {title, description} (como los badges).
    hadFaqsField = data.containsKey('faqs');
    final faqRaw = (data['faqs'] as List?) ?? const [];
    faqs.clear();
    for (final f in faqRaw) {
      if (f is Map) {
        faqs.add(_FaqField(
          question: TextEditingController(
              text: (f['question'] ?? f['q'] ?? f['title'] ?? '').toString()),
          answer: TextEditingController(
              text: (f['answer'] ?? f['a'] ?? f['description'] ?? '')
                  .toString()),
        ));
      }
    }

    final rawBanners = (data['banners'] as List?) ?? const [];
    banners.clear();
    for (final b in rawBanners) {
      if (b is Map) banners.add(Map<String, dynamic>.from(b));
    }
    setState(() => loaded = true);
  }

  Future<void> _save() async {
    // Una fila a medio llenar se perdería al guardar; avisamos antes.
    final incomplete = faqs.any((f) {
      final q = f.question.text.trim();
      final a = f.answer.text.trim();
      return q.isEmpty != a.isEmpty;
    });
    if (incomplete) {
      SoftTheme.showSnack(
        context,
        'Cada pregunta necesita su respuesta. Complétala o elimina la fila.',
        type: SnackType.error,
      );
      return;
    }

    setState(() => saving = true);
    try {
      final payload = <String, dynamic>{
        'slogan': sloganCtrl.text.trim(),
        'heroBadges': heroBadges
            .where((b) => b.text.text.trim().isNotEmpty)
            .map((b) => {
                  'text': b.text.text.trim(),
                  'description': b.description.text.trim(),
                })
            .toList(),
        'themePrimary': _toHex(_primary),
        'themePrimaryDark': _toHex(_primaryDark),
        'themePrimarySoft': _toHex(_primarySoft),
        'themeBackground': _toHex(_background),
        'themeSurface': _toHex(_surface),
        'themeText': _toHex(_text),
        'themeTextMuted': _toHex(_textMuted),
      };
      // Si nunca hubo FAQ y el admin no agregó ninguna, no escribimos el campo:
      // la web sigue mostrando las preguntas de ejemplo.
      if (hadFaqsField || faqs.any((f) => f.question.text.trim().isNotEmpty)) {
        payload['faqs'] = faqs
            .where((f) => f.question.text.trim().isNotEmpty)
            .map((f) => {
                  'question': f.question.text.trim(),
                  'answer': f.answer.text.trim(),
                })
            .toList();
      }
      await FirebaseFirestore.instance
          .collection('store_config')
          .doc('general')
          .set(payload, SetOptions(merge: true));
      hadFaqsField = payload.containsKey('faqs');
      if (mounted) {
        SoftTheme.showSnack(context, 'Apariencia guardada',
            type: SnackType.success);
      }
    } catch (_) {
      if (mounted) {
        SoftTheme.showSnack(context, 'No se pudo guardar. Revisa tu conexión.',
            type: SnackType.error);
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Color _parseHex(dynamic v, Color fallback) {
    if (v == null) return fallback;
    var s = v.toString().trim();
    if (s.startsWith('#')) s = s.substring(1);
    if (s.length == 6) return Color(int.parse('FF${s.toUpperCase()}', radix: 16));
    if (s.length == 8) return Color(int.parse(s.toUpperCase(), radix: 16));
    return fallback;
  }

  String _toHex(Color c) =>
      '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}';

  Future<void> _pickColor(
      String label, Color current, ValueChanged<Color> onPick) async {
    const presets = [
      // Esmeralda (original)
      Color(0xFF10B981),
      Color(0xFF047857),
      Color(0xFFECFDF5),
      Color(0xFF34D399),
      Color(0xFF065F46),
      Color(0xFF6EE7B7),
      // Azules
      Color(0xFF2563EB),
      Color(0xFF1E40AF),
      Color(0xFFDBEAFE),
      Color(0xFF3B82F6),
      Color(0xFF60A5FA),
      Color(0xFF1D4ED8),
      // Celeste / cyan
      Color(0xFF0EA5E9),
      Color(0xFF0284C7),
      Color(0xFFE0F2FE),
      Color(0xFF38BDF8),
      Color(0xFF0891B2),
      Color(0xFF0E7490),
      // Violeta
      Color(0xFF7C3AED),
      Color(0xFF6D28D9),
      Color(0xFFEDE9FE),
      Color(0xFF8B5CF6),
      Color(0xFF5B21B6),
      Color(0xFFA78BFA),
      // Rosa / rojo
      Color(0xFFE11D48),
      Color(0xFFBE123C),
      Color(0xFFFFE4E6),
      Color(0xFFF43F5E),
      Color(0xFF9F1239),
      Color(0xFFFB7185),
      // Ámbar / naranja
      Color(0xFFD97706),
      Color(0xFFF59E0B),
      Color(0xFFFEF3C7),
      Color(0xFFEA580C),
      Color(0xFFF97316),
      Color(0xFFB45309),
      // Verde
      Color(0xFF16A34A),
      Color(0xFF15803D),
      Color(0xFFDCFCE7),
      Color(0xFF22C55E),
      Color(0xFF166534),
      Color(0xFF4D7C0F),
      Color(0xFF65A30D),
      Color(0xFF0F766E),
      // Neutros / fondos
      Color(0xFFF0F4F8),
      Color(0xFFF8FAFC),
      Color(0xFFE2E8F0),
      Color(0xFFFFFFFF),
      Color(0xFFF1F5F9),
      Color(0xFFE7E5E4),
      // Texto / grises
      Color(0xFF1E293B),
      Color(0xFF64748B),
      Color(0xFF94A3B8),
      Color(0xFF0F172A),
      Color(0xFF334155),
      Color(0xFFCBD5E1),
      // Extras
      Color(0xFFA16207),
      Color(0xFFC026D3),
      Color(0xFFDB2777),
      Color(0xFF9333EA),
      Color(0xFF0369A1),
      Color(0xFF0D9488),
    ];

    String toHex(Color c) =>
        '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}';

    Color? parseCustom(String raw) {
      var s = raw.trim();
      if (s.startsWith('#')) s = s.substring(1);
      if (s.length == 3) {
        // #ABC -> #AABBCC
        s = s.split('').map((ch) => ch + ch).join();
      }
      if (s.length == 6) {
        final v = int.tryParse(s.toUpperCase(), radix: 16);
        if (v != null) return Color(0xFF000000 | v);
      }
      if (s.length == 8) {
        final v = int.tryParse(s.toUpperCase(), radix: 16);
        if (v != null) return Color(v);
      }
      return null;
    }

    final customCtrl = TextEditingController(text: toHex(current));
    final picked = await showDialog<Color>(
      context: context,
      builder: (ctx) {
        Color preview = current;
        final builder = StatefulBuilder(
          builder: (ctx, setDialog) {
            return AlertDialog(
              title: Text(label,
                  style: const TextStyle(fontWeight: FontWeight.w800)),
              content: SizedBox(
                width: double.maxFinite,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: customCtrl,
                            decoration: InputDecoration(
                              labelText: 'Escribe un color, ej. #FF5733',
                              hintText: 'Usa 6 caracteres después del #',
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              isDense: true,
                            ),
                            textCapitalization: TextCapitalization.characters,
                            onChanged: (v) {
                              final p = parseCustom(v);
                              if (p != null) setDialog(() => preview = p);
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: preview,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: SoftTheme.outline),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 38,
                      child: OutlinedButton(
                        onPressed: () {
                          final p = parseCustom(customCtrl.text);
                          if (p != null) Navigator.pop(ctx, p);
                        },
                        child: const Text('Aplicar personalizado'),
                        style: OutlinedButton.styleFrom(
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(999),
                          ),
                          side: const BorderSide(color: SoftTheme.cBlue),
                          foregroundColor: preview,
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'O elige de la paleta',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: SoftTheme.textMuted,
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 320,
                      child: GridView.builder(
                        shrinkWrap: true,
                        physics: const AlwaysScrollableScrollPhysics(),
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 6,
                          crossAxisSpacing: 8,
                          mainAxisSpacing: 8,
                        ),
                        itemCount: presets.length,
                        itemBuilder: (context, idx) {
                          final c = presets[idx];
                          final isCurrent = c == current;
                          return InkWell(
                            onTap: () => Navigator.pop(ctx, c),
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              decoration: BoxDecoration(
                                color: c,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: isCurrent
                                      ? SoftTheme.text
                                      : SoftTheme.outline,
                                  width: isCurrent ? 2.5 : 1,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancelar'),
                ),
              ],
            );
          },
        );
        return builder;
      },
    );
    customCtrl.dispose();
    if (picked != null && mounted) onPick(picked);
  }

  Future<void> _uploadBanner() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(source: ImageSource.gallery);
    if (file == null) return;
    setState(() => savingBanners = true);
    try {
      final ref = FirebaseStorage.instance
          .ref('banners/${DateTime.now().millisecondsSinceEpoch}.jpg');
      await ref.putData(await file.readAsBytes());
      final url = await ref.getDownloadURL();
      final docRef =
          FirebaseFirestore.instance.collection('store_config').doc('general');
      final snap = await docRef.get();
      final list = [...((snap.data()?['banners'] as List?) ?? const [])];
      // No duplicar el mismo banner si el reintento genera la misma URL.
      list.add({
        'id': DateTime.now().millisecondsSinceEpoch.toString(),
        'imageUrl': url,
        'isActive': true,
      });
      await docRef.set({'banners': list}, SetOptions(merge: true));
      if (!mounted) return;
      setState(() {
        banners.add({
          'id': DateTime.now().millisecondsSinceEpoch.toString(),
          'imageUrl': url,
          'isActive': true,
        });
      });
      SoftTheme.showSnack(context, 'Banner subido', type: SnackType.success);
    } catch (_) {
      if (mounted) {
        SoftTheme.showSnack(context, 'No se pudo subir el banner.',
            type: SnackType.error);
      }
    } finally {
      if (mounted) setState(() => savingBanners = false);
    }
  }

  Future<void> _deleteBanner(int index) async {
    if (index < 0 || index >= banners.length) return;
    final url = banners[index]['imageUrl']?.toString() ?? '';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar banner'),
        content: const Text('Se quitará el banner de la tienda y su imagen.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => savingBanners = true);
    try {
      // Primero borra el objeto de Storage (no falla si ya no existe),
      // luego actualiza el array en Firestore.
      if (url.isNotEmpty) await _media.deleteByUrl(url);
      final newBanners = [...banners]..removeAt(index);
      await FirebaseFirestore.instance
          .collection('store_config')
          .doc('general')
          .set({'banners': newBanners}, SetOptions(merge: true));
      if (!mounted) return;
      setState(() => banners.removeAt(index));
      SoftTheme.showSnack(context, 'Banner eliminado', type: SnackType.success);
    } catch (_) {
      if (mounted) {
        SoftTheme.showSnack(context, 'No se pudo eliminar el banner.',
            type: SnackType.error);
      }
    } finally {
      if (mounted) setState(() => savingBanners = false);
    }
  }

  Future<void> _editBannerUrl(int index) async {
    if (index < 0 || index >= banners.length) return;
    final current = banners[index]['redirectUrl']?.toString() ?? '';
    final ctrl = TextEditingController(text: current);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('URL del banner (opcional)'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(
            labelText: 'URL al tocar el banner',
            helperText: 'Vacío = no abre nada',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final newUrl = ctrl.text.trim();
    banners[index]['redirectUrl'] = newUrl;
    try {
      await FirebaseFirestore.instance
          .collection('store_config')
          .doc('general')
          .set({'banners': banners}, SetOptions(merge: true));
      if (!mounted) return;
      setState(() {});
      SoftTheme.showSnack(context, 'URL del banner guardada',
          type: SnackType.success);
    } catch (_) {
      if (mounted) {
        SoftTheme.showSnack(context, 'No se pudo guardar la URL.',
            type: SnackType.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SoftTheme.background,
      appBar: AppBar(title: const Text('Apariencia de la web')),
      body: !loaded
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
                    children: [
                      const Padding(
                        padding: EdgeInsets.fromLTRB(4, 8, 4, 0),
                        child: Text(
                          'Estos cambios se ven en la web, no en esta app.',
                          style: TextStyle(
                              fontSize: 12, color: SoftTheme.textMuted),
                        ),
                      ),
                      SoftSection(
                        title: 'Enunciado de la home',
                        child: TextField(
                          controller: sloganCtrl,
                          maxLines: 2,
                          decoration: softField(
                            'Enunciado (slogan) de la página principal',
                            helperText:
                                'Se muestra bajo el nombre de la empresa en la web.',
                          ),
                        ),
                      ),
                      SoftSection(
                        title: 'Badges del hero',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text(
                              'Son las píldoras con las ventajas de la tienda (entrega, pago, garantía).',
                              style: TextStyle(fontSize: 12),
                            ),
                            const SizedBox(height: 8),
                            if (heroBadges.isEmpty)
                              const Text(
                                'Sin badges. Agrega el primero abajo.',
                                style: TextStyle(fontSize: 12),
                              ),
                            for (var i = 0; i < heroBadges.length; i++)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(
                                      child: Column(
                                        children: [
                                          TextField(
                                            controller: heroBadges[i].text,
                                            decoration: softField(
                                              'Badge ${i + 1} (título)',
                                              helperText:
                                                  'Ej: Entrega a domicilio.',
                                            ),
                                          ),
                                          const SizedBox(height: 8),
                                          TextField(
                                            controller:
                                                heroBadges[i].description,
                                            maxLines: 2,
                                            decoration: softField(
                                              'Descripción (cuadro al tocarlo)',
                                              helperText:
                                                  'Texto llamativo que abre al presionar el badge.',
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.delete_outline,
                                          color: Colors.red),
                                      tooltip: 'Quitar badge',
                                      onPressed: () {
                                        setState(() {
                                          heroBadges[i].text.dispose();
                                          heroBadges[i].description.dispose();
                                          heroBadges.removeAt(i);
                                        });
                                      },
                                    ),
                                  ],
                                ),
                              ),
                            const SizedBox(height: 4),
                            SoftTheme.softButton(
                              label: 'Agregar badge',
                              icon: Icons.add,
                              primary: false,
                              onPressed: () {
                                setState(() {
                                  heroBadges.add(_HeroBadgeField(
                                      text: TextEditingController(),
                                      description: TextEditingController()));
                                });
                              },
                            ),
                          ],
                        ),
                      ),
                      SoftSection(
                        title: 'Preguntas frecuentes',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text(
                              'Se muestran al final de la home y ayudan al SEO: Google puede destacarlas en los resultados.',
                              style: TextStyle(
                                  fontSize: 12, color: SoftTheme.textMuted),
                            ),
                            const SizedBox(height: 8),
                            if (faqs.isEmpty)
                              const Text(
                                'Sin preguntas. Agrega la primera abajo.',
                                style: TextStyle(fontSize: 12),
                              ),
                            for (var i = 0; i < faqs.length; i++)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Expanded(
                                      child: Column(
                                        children: [
                                          TextField(
                                            controller: faqs[i].question,
                                            decoration: softField(
                                              'Pregunta ${i + 1}',
                                              helperText:
                                                  'Ej: ¿Hacen envíos a todo el país?',
                                            ),
                                          ),
                                          const SizedBox(height: 8),
                                          TextField(
                                            controller: faqs[i].answer,
                                            minLines: 2,
                                            maxLines: 4,
                                            decoration: softField(
                                              'Respuesta',
                                              helperText:
                                                  'Responde claro y breve; es lo que verá el cliente.',
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.delete_outline,
                                          color: Colors.red),
                                      tooltip: 'Quitar pregunta',
                                      onPressed: () {
                                        setState(() {
                                          faqs[i].question.dispose();
                                          faqs[i].answer.dispose();
                                          faqs.removeAt(i);
                                        });
                                      },
                                    ),
                                  ],
                                ),
                              ),
                            const SizedBox(height: 4),
                            SoftTheme.softButton(
                              label: 'Agregar pregunta',
                              icon: Icons.add,
                              primary: false,
                              onPressed: () {
                                setState(() {
                                  faqs.add(_FaqField(
                                      question: TextEditingController(),
                                      answer: TextEditingController()));
                                });
                              },
                            ),
                          ],
                        ),
                      ),
                      SoftSection(
                        title: 'Colores de la web',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Botones, encabezados y fondos de la web.',
                              style: TextStyle(
                                  fontSize: 12, color: SoftTheme.textMuted),
                            ),
                            const SizedBox(height: 12),
                            _ColorRow(
                                label: 'Primario',
                                color: _primary,
                                onTap: () => _pickColor('Primario', _primary,
                                    (c) => setState(() => _primary = c))),
                            _ColorRow(
                                label: 'Primario oscuro',
                                color: _primaryDark,
                                onTap: () => _pickColor('Primario oscuro',
                                    _primaryDark,
                                    (c) => setState(() => _primaryDark = c))),
                            _ColorRow(
                                label: 'Primario suave',
                                color: _primarySoft,
                                onTap: () => _pickColor('Primario suave',
                                    _primarySoft,
                                    (c) => setState(() => _primarySoft = c))),
                            _ColorRow(
                                label: 'Fondo',
                                color: _background,
                                onTap: () => _pickColor('Fondo', _background,
                                    (c) => setState(() => _background = c))),
                            _ColorRow(
                                label: 'Superficie',
                                color: _surface,
                                onTap: () => _pickColor('Superficie', _surface,
                                    (c) => setState(() => _surface = c))),
                            _ColorRow(
                                label: 'Texto',
                                color: _text,
                                onTap: () => _pickColor('Texto', _text,
                                    (c) => setState(() => _text = c))),
                            _ColorRow(
                                label: 'Texto secundario',
                                color: _textMuted,
                                onTap: () => _pickColor('Texto secundario',
                                    _textMuted,
                                    (c) => setState(() => _textMuted = c))),
                          ],
                        ),
                      ),
                      SoftSection(
                        title: 'Banners de la home',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (banners.isEmpty)
                              const Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Aún no hay banners subidos.'),
                                  SizedBox(height: 4),
                                  Text(
                                    'Sube uno con el botón de abajo. Con más de un banner, la web los muestra en carrusel.',
                                    style: TextStyle(fontSize: 12),
                                  ),
                                ],
                              ),
                            for (var i = 0; i < banners.length; i++)
                              _BannerTile(
                                banner: banners[i],
                                onDelete: savingBanners
                                    ? null
                                    : () => _deleteBanner(i),
                                onEditUrl: savingBanners
                                    ? null
                                    : () => _editBannerUrl(i),
                              ),
                            const SizedBox(height: 8),
                            SoftTheme.softButton(
                              label: savingBanners
                                  ? 'Subiendo…'
                                  : 'Subir banner',
                              icon: Icons.upload,
                              primary: false,
                              onPressed: savingBanners ? null : _uploadBanner,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    child: SoftTheme.fabButton(
                      label: saving ? 'Guardando…' : 'Guardar apariencia',
                      icon: Icons.save,
                      onPressed: saving ? null : _save,
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _BannerTile extends StatelessWidget {
  const _BannerTile({
    required this.banner,
    required this.onDelete,
    required this.onEditUrl,
  });

  final Map<String, dynamic> banner;
  final VoidCallback? onDelete;
  final VoidCallback? onEditUrl;

  @override
  Widget build(BuildContext context) {
    final url = banner['imageUrl']?.toString() ?? '';
    final isActive = banner['isActive'] == true;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(SoftTheme.radiusThumb),
            child: SizedBox(
              width: 96,
              height: 54,
              child: url.isEmpty
                  ? Container(
                      color: SoftTheme.inputBg,
                      child: const Icon(Icons.image_outlined),
                    )
                  : Image.network(
                      url,
                      fit: BoxFit.cover,
                      // Miniatura pequeña: no descargar la imagen completa.
                      cacheWidth: 192,
                      errorBuilder: (_, __, ___) => Container(
                        color: SoftTheme.inputBg,
                        child: const Icon(Icons.image_not_supported_outlined),
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SoftBadge(
                  text: isActive ? 'Activo' : 'Oculto',
                  color: isActive ? SoftTheme.cEmerald : SoftTheme.textMuted,
                ),
                const SizedBox(height: 4),
                Text(
                  url,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 11, color: SoftTheme.textMuted),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.link),
            tooltip: 'Colocar URL en este banner',
            onPressed: onEditUrl,
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline, color: Colors.red),
            tooltip: 'Eliminar banner',
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}

/// Fila de color web — pastilla "3D suave": contenedor suave + texto intenso.
class _ColorRow extends StatelessWidget {
  const _ColorRow(
      {required this.label, required this.color, required this.onTap});
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final hex =
        '#${color.toARGB32().toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: color.withValues(alpha: 0.18)),
          ),
          child: Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(10),
                  border:
                      Border.all(color: Colors.white.withValues(alpha: 0.6)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(label,
                    style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: SoftTheme.text)),
              ),
              Text(hex,
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: SoftTheme.textMuted)),
              const SizedBox(width: 6),
              const Icon(Icons.palette_outlined,
                  size: 20, color: SoftTheme.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
