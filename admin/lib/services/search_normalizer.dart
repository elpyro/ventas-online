/// Firestore no tiene búsqueda de texto completo, así que ambos lados de la
/// comparación se llevan a una forma sin tildes. Igual que en la web
/// (web/lib/search.ts), pero Dart de núcleo no trae NFD:
/// se reemplazan las tildes comunes del español.
class SearchNormalizer {
  const SearchNormalizer._();

  /// Quita espacios extra, pasa a minúsculas y reemplaza tildes por ASCII.
  static String normalize(String value) {
    var s = value.trim().toLowerCase();
    const replacements = {
      'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n',
      'â': 'a', 'ê': 'e', 'î': 'i', 'ô': 'o', 'û': 'u',
      'ã': 'a', 'õ': 'o', 'ç': 'c',
    };
    replacements.forEach((from, to) => s = s.replaceAll(from, to));
    return s.replaceAll(RegExp(r'\s+'), ' ');
  }
}
