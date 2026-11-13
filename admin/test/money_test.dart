import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';

import 'package:ventas_online_admin/utils/money.dart';

void main() {
  // La app usa es_CO: miles con punto y decimales con coma.
  final esCo = NumberFormat('#,##0.00', 'es_CO');

  group('CopFormat', () {
    test('formatea con dos decimales por defecto y símbolo \$ delante', () {
      expect(const CopFormat().format(650000), '\$ ${esCo.format(650000)}');
      expect(const CopFormat().format(650000), '\$ 650.000,00');
    });

    test('decimals: 0 muestra enteros', () {
      expect(const CopFormat(decimals: 0).format(650000), '\$ 650.000');
    });

    test('valor null se trata como cero', () {
      expect(const CopFormat().format(null), '\$ 0,00');
    });

    test('cero explícito', () {
      expect(const CopFormat().format(0), '\$ 0,00');
    });

    test('decimales se redondean a dos', () {
      expect(const CopFormat().format(1234.567), '\$ ${esCo.format(1234.57)}');
    });
  });
}
