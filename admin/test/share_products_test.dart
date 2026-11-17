import 'package:flutter_test/flutter_test.dart';

import 'package:ventas_online_admin/services/share_products_service.dart';

ShareProduct _product({
  String sku = 'ABC123',
  Map<String, dynamic>? data,
}) =>
    ShareProduct(
      sku: sku,
      data: data ??
          {
            'name': 'Audífonos X9',
            'price': 65000,
            'description': 'Bluetooth 5.3 con estuche.',
            'variants': [
              {'id': 'negro', 'color': 'Negro', 'stock': 4},
              {'id': 'blanco-m', 'color': 'Blanco', 'size': 'M', 'price': 70000, 'stock': 0},
            ],
            'specs': [
              {'label': 'Garantía', 'value': '30 días'},
              {'label': 'Material', 'value': 'Plástico'},
            ],
          },
    );

void main() {
  group('buildShareMessage', () {
    test('un producto incluye el link de la ficha', () {
      final message = buildShareMessage(
        [_product()],
        const ShareFields(name: true, price: true),
      );
      expect(message, contains('Audífonos X9'));
      expect(message, contains('Precio:'));
      expect(message, contains('https://celtoons.com/producto/ABC123'));
    });

    test('varios productos no incluyen link y separan bloques con línea en blanco',
        () {
      final message = buildShareMessage(
        [_product(), _product(sku: 'DEF456')],
        const ShareFields(name: true, price: true),
      );
      expect(message, isNot(contains('celtoons.com')));
      expect(message.split('\n\n'), hasLength(2));
    });

    test('variantes muestran nombre, precio propio y stock o agotado', () {
      final message = buildShareMessage(
        [_product()],
        const ShareFields(variants: true),
      );
      expect(message, contains('Variantes:'));
      expect(message, contains('Negro · \$ 65.000,00 · 4 und'));
      expect(message, contains('Blanco / M · \$ 70.000,00 · agotado'));
    });

    test('especificaciones se listan como campo: valor', () {
      final message = buildShareMessage(
        [_product()],
        const ShareFields(specs: true),
      );
      expect(
        message,
        contains('Especificaciones: Garantía: 30 días; Material: Plástico'),
      );
    });

    test('sin nada marcado cae al nombre para no compartir un mensaje vacío',
        () {
      final message = buildShareMessage(
        [_product(), _product(sku: 'DEF456')],
        const ShareFields(
          name: false,
          price: false,
          description: false,
          variants: false,
          specs: false,
        ),
      );
      expect(message.trim(), 'Audífonos X9\n\nAudífonos X9');
    });
  });

  group('ShareFields', () {
    test('toKeys/fromKeys conserva la selección (roundtrip)', () {
      const original = ShareFields(
        name: true,
        image: true,
        price: false,
        description: true,
        variants: true,
        specs: false,
      );
      final restored = ShareFields.fromKeys(original.toKeys());
      expect(restored.name, isTrue);
      expect(restored.image, isTrue);
      expect(restored.price, isFalse);
      expect(restored.description, isTrue);
      expect(restored.variants, isTrue);
      expect(restored.specs, isFalse);
    });
  });
}
