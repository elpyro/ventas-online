import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../theme/soft_theme.dart';
import '../widgets/soft_section.dart';
import 'store_appearance_screen.dart';
import 'store_seo_screen.dart';

/// Configuración de la tienda.
///
/// Aquí quedan solo los datos de contacto y operación. Lo visual vive en
/// "Apariencia de la web" y lo de buscadores/IA en "Google e IA", cada uno con
/// su propio botón Guardar para no pisar datos entre pantallas.
class ConfigScreen extends StatefulWidget {
  const ConfigScreen({super.key});

  @override
  State<ConfigScreen> createState() => _ConfigScreenState();
}

class _ConfigScreenState extends State<ConfigScreen> {
  final nameCtrl = TextEditingController();
  final phoneCtrl = TextEditingController();
  final phone2Ctrl = TextEditingController();
  final cityCtrl = TextEditingController();
  final minCtrl = TextEditingController();
  final privacyCtrl = TextEditingController();
  final latCtrl = TextEditingController();
  final lngCtrl = TextEditingController();

  bool loaded = false;
  bool saving = false;
  String logoUrl = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    nameCtrl.dispose();
    phoneCtrl.dispose();
    phone2Ctrl.dispose();
    cityCtrl.dispose();
    minCtrl.dispose();
    privacyCtrl.dispose();
    latCtrl.dispose();
    lngCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final snap = await FirebaseFirestore.instance
        .collection('store_config')
        .doc('general')
        .get();
    final data = snap.data() ?? {};
    nameCtrl.text = data['companyName']?.toString() ?? '';
    phoneCtrl.text = data['phoneContact']?.toString() ?? '';
    phone2Ctrl.text = (data['phoneContact2'] ??
            data['phoneContactSecondary'] ??
            data['phone2'] ??
            '')
        .toString();
    cityCtrl.text = data['city']?.toString() ?? '';
    minCtrl.text = '${data['globalMinOrder'] ?? 0}';
    privacyCtrl.text = data['privacyPolicyUrl']?.toString() ?? '';
    latCtrl.text = data['gpsLat']?.toString() ?? '';
    lngCtrl.text = data['gpsLng']?.toString() ?? '';
    logoUrl = data['logoUrl']?.toString() ?? '';
    if (mounted) setState(() => loaded = true);
  }

  Future<void> _save() async {
    setState(() => saving = true);
    try {
      await FirebaseFirestore.instance
          .collection('store_config')
          .doc('general')
          .set({
        'companyName': nameCtrl.text.trim(),
        'phoneContact': phoneCtrl.text.trim(),
        'phoneContact2': phone2Ctrl.text.trim(),
        'city': cityCtrl.text.trim(),
        'globalMinOrder': double.tryParse(minCtrl.text.trim()) ?? 0,
        'privacyPolicyUrl': privacyCtrl.text.trim(),
        'gpsLat': double.tryParse(latCtrl.text.trim().replaceAll(',', '.')),
        'gpsLng': double.tryParse(lngCtrl.text.trim().replaceAll(',', '.')),
        'logoUrl': logoUrl,
      }, SetOptions(merge: true));
      if (mounted) {
        SoftTheme.showSnack(context, 'Datos de la tienda guardados',
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

  Future<void> _uploadLogo() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(source: ImageSource.gallery);
    if (file == null) return;
    try {
      final ref = FirebaseStorage.instance
          .ref('logos/logo_${DateTime.now().millisecondsSinceEpoch}.jpg');
      await ref.putData(await file.readAsBytes());
      final url = await ref.getDownloadURL();
      await FirebaseFirestore.instance
          .collection('store_config')
          .doc('general')
          .set({'logoUrl': url}, SetOptions(merge: true));
      if (mounted) {
        setState(() => logoUrl = url);
        SoftTheme.showSnack(context, 'Logo subido', type: SnackType.success);
      }
    } catch (_) {
      if (mounted) {
        SoftTheme.showSnack(context, 'No se pudo subir el logo.',
            type: SnackType.error);
      }
    }
  }

  void _openAppearance() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const StoreAppearanceScreen()),
    );
  }

  void _openSeo() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const StoreSeoScreen()),
    );
  }

  Widget _navCard({
    required IconData icon,
    required Color color,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return SoftTile(
      onTap: onTap,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: color.withValues(alpha: 0.22)),
            ),
            child: Icon(icon, color: color, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: SoftTheme.text,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(
                      fontSize: 12, color: SoftTheme.textMuted),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: SoftTheme.textMuted),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!loaded) return const Center(child: CircularProgressIndicator());
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 16),
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(4, 8, 4, 0),
                child: Text(
                  'Datos de la tienda y accesos a las demás opciones.',
                  style:
                      TextStyle(fontSize: 12, color: SoftTheme.textMuted),
                ),
              ),
              SoftSection(
                title: 'Datos de la tienda',
                child: Column(
                  children: [
                    if (logoUrl.isNotEmpty)
                      InkWell(
                        onTap: () => showDialog<void>(
                          context: context,
                          builder: (_) => Dialog(
                            backgroundColor: Colors.transparent,
                            insetPadding: const EdgeInsets.all(16),
                            child: GestureDetector(
                              onTap: () => Navigator.pop(context),
                              child: InteractiveViewer(
                                child:
                                    Image.network(logoUrl, fit: BoxFit.contain),
                              ),
                            ),
                          ),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.network(logoUrl,
                              height: 56,
                              errorBuilder: (_, __, ___) =>
                                  const Icon(Icons.broken_image)),
                        ),
                      ),
                    const SizedBox(height: 8),
                    SoftTheme.softButton(
                      label: 'Subir logo',
                      icon: Icons.upload,
                      primary: false,
                      height: 42,
                      onPressed: _uploadLogo,
                    ),
                    const SizedBox(height: 14),
                    TextField(
                        controller: nameCtrl,
                        decoration: softField('Nombre empresa')),
                    const SizedBox(height: 12),
                    TextField(
                        controller: phoneCtrl,
                        decoration: softField('Teléfono contacto',
                            helperText: 'Celular principal de WhatsApp.')),
                    const SizedBox(height: 12),
                    TextField(
                        controller: phone2Ctrl,
                        decoration: softField(
                            'Teléfono 2 (WhatsApp, opcional)',
                            helperText:
                                'Si lo dejas vacío, el botón flotante usa solo el principal.')),
                    const SizedBox(height: 12),
                    TextField(
                        controller: cityCtrl,
                        decoration: softField('Ciudad')),
                    const SizedBox(height: 12),
                    TextField(
                      controller: minCtrl,
                      keyboardType: TextInputType.number,
                      decoration: softField('Compra mínima global (COP)'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: privacyCtrl,
                      decoration: softField(
                        'URL de política de privacidad (opcional)',
                        helperText: 'Se mostrará en el pie de la web si existe',
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: latCtrl,
                            keyboardType: const TextInputType.numberWithOptions(
                                decimal: true, signed: true),
                            decoration: softField('Ubicación GPS (Lat)'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: TextField(
                            controller: lngCtrl,
                            keyboardType: const TextInputType.numberWithOptions(
                                decimal: true, signed: true),
                            decoration: softField('Ubicación GPS (Lng)'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        'Si colocas la ubicación GPS, se mostrará en el pie de la web.',
                        style: TextStyle(
                            fontSize: 11, color: SoftTheme.textMuted),
                      ),
                    ),
                  ],
                ),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(4, 14, 4, 6),
                child: Text(
                  'Personalizar la web',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: SoftTheme.text,
                  ),
                ),
              ),
              _navCard(
                icon: Icons.palette_outlined,
                color: SoftTheme.cViolet,
                title: 'Apariencia de la web',
                subtitle: 'Banners, colores, badges y enunciado de la home',
                onTap: _openAppearance,
              ),
              _navCard(
                icon: Icons.travel_explore_outlined,
                color: SoftTheme.cBlue,
                title: 'Google e IA',
                subtitle: 'SEO, redes sociales, llms.txt y clave de Gemini',
                onTap: _openSeo,
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: SoftTheme.fabButton(
              label: saving ? 'Guardando…' : 'Guardar datos de la tienda',
              icon: Icons.save,
              onPressed: saving ? null : _save,
            ),
          ),
        ),
      ],
    );
  }
}
