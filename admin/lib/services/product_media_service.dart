import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';

/// Subida de fotos y video de productos a Firebase Storage.
///
/// Los binarios van a `products/{sku}/...` (ver storage.rules): la lectura es
/// pública porque las fotos se muestran en la web, pero solo un admin puede
/// escribir.
class ProductMediaService {
  final _storage = FirebaseStorage.instance;
  final _picker = ImagePicker();

  Future<List<XFile>> pickImages() {
    return _picker.pickMultiImage(imageQuality: 80, maxWidth: 1600);
  }

  Future<List<XFile>> pickImagesFrom(ImageSource source) {
    // Cámara → solo una foto; galería → varias.
    if (source == ImageSource.camera) {
      return _picker
          .pickImage(source: source, imageQuality: 80, maxWidth: 1600)
          .then((f) => f == null ? <XFile>[] : [f]);
    }
    return _picker.pickMultiImage(imageQuality: 80, maxWidth: 1600);
  }

  Future<XFile?> pickVideo() {
    return _picker.pickVideo(
      source: ImageSource.gallery,
      maxDuration: const Duration(seconds: 60),
    );
  }

  Future<String> uploadProductImage(String sku, XFile file) async {
    final ts = DateTime.now().millisecondsSinceEpoch;
    final path = 'products/$sku/images/$ts.${_extension(file.path, 'jpg')}';
    return _put(path, file, _contentType(file.path, 'image/jpeg'));
  }

  /// Portada de catálogo (`catalogs/cover_{ts}.jpg`).
  Future<String> uploadCatalogCover(XFile file) async {
    final ts = DateTime.now().millisecondsSinceEpoch;
    final path = 'catalogs/cover_$ts.${_extension(file.path, 'jpg')}';
    return _put(path, file, _contentType(file.path, 'image/jpeg'));
  }

  /// Imagen OG (para compartir) de la Config (`og/og_{ts}.jpg`).
  Future<String> uploadOgImage(XFile file) async {
    final ts = DateTime.now().millisecondsSinceEpoch;
    final path = 'og/og_$ts.${_extension(file.path, 'jpg')}';
    return _put(path, file, _contentType(file.path, 'image/jpeg'));
  }

  Future<String> uploadProductVideo(String sku, XFile file) async {
    final size = await file.length();
    if (size > 25 * 1024 * 1024) {
      throw ArgumentError('El video supera los 25 MB permitidos.');
    }
    final ts = DateTime.now().millisecondsSinceEpoch;
    final path = 'products/$sku/videos/$ts.${_extension(file.path, 'mp4')}';
    return _put(path, file, _contentType(file.path, 'video/mp4'));
  }

  /// Borra el objeto de Storage a partir de su URL de descarga. No falla si
  /// el objeto ya no existe (se ignora el error).
  Future<bool> deleteByUrl(String url) async {
    if (url.isEmpty) return false;
    try {
      await _storage.refFromURL(url).delete();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<String> _put(String path, XFile file, String contentType) async {
    final bytes = await file.readAsBytes();
    final ref = _storage.ref(path);
    await ref.putData(bytes, SettableMetadata(contentType: contentType));
    return ref.getDownloadURL();
  }

  String _extension(String path, String fallback) {
    final dot = path.lastIndexOf('.');
    if (dot <= 0 || dot >= path.length - 1) return fallback;
    final ext = path.substring(dot + 1).toLowerCase();
    return RegExp(r'^[a-z0-9]{2,5}$').hasMatch(ext) ? ext : fallback;
  }

  String _contentType(String path, String fallback) {
    final p = path.toLowerCase();
    if (p.endsWith('.png')) return 'image/png';
    if (p.endsWith('.webp')) return 'image/webp';
    if (p.endsWith('.gif')) return 'image/gif';
    if (p.endsWith('.mp4')) return 'video/mp4';
    if (p.endsWith('.mov')) return 'video/quicktime';
    if (p.endsWith('.webm')) return 'video/webm';
    if (p.endsWith('.mkv')) return 'video/x-matroska';
    return fallback;
  }
}
