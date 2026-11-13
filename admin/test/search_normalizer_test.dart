import 'package:flutter_test/flutter_test.dart';

import 'package:ventas_online_admin/services/search_normalizer.dart';

void main() {
  group('SearchNormalizer.normalize', () {
    test('quita tildes comunes del español', () {
      expect(SearchNormalizer.normalize('Tecnología'), 'tecnologia');
      expect(SearchNormalizer.normalize('Camión'), 'camion');
      expect(SearchNormalizer.normalize('Ñandú'), 'nandu');
      expect(SearchNormalizer.normalize('Pingüino'), 'pinguino');
      expect(SearchNormalizer.normalize('Coração'), 'coracao');
    });

    test('pasa a minúsculas', () {
      expect(SearchNormalizer.normalize('FUNDA SILICONA'), 'funda silicona');
    });

    test('colapsa espacios múltiples y recorta extremos', () {
      expect(SearchNormalizer.normalize('  funda   para   celular  '), 'funda para celular');
    });

    test('cadena mixta con tildes, mayúsculas y espacios', () {
      expect(SearchNormalizer.normalize('  Funda  para  iPhone  13 Pro  '), 'funda para iphone 13 pro');
    });

    test('cadena vacía', () {
      expect(SearchNormalizer.normalize(''), '');
      expect(SearchNormalizer.normalize('   '), '');
    });

    test('conserva dígitos y guiones', () {
      expect(SearchNormalizer.normalize('A5511-9-10'), 'a5511-9-10');
    });
  });
}
