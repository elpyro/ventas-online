import 'package:intl/intl.dart';

/// Formato de moneda de la tienda: pesos colombianos (COP) con el símbolo
/// delante, igual que en la web: `$ 650.000,00`.
///
/// Se expone como objeto con `format(...)` para poder reemplazar
/// `NumberFormat.currency(...)` sin tocar cada uso (`cop.format(total)`).
class CopFormat {
  const CopFormat({this.decimals = 2});

  /// Decimales a mostrar. Usa 0 para mínimos de compra enteros.
  final int decimals;

  String format(num? value) {
    final pattern = decimals > 0 ? '#,##0.00' : '#,##0';
    return '\$ ${NumberFormat(pattern, 'es_CO').format(value ?? 0)}';
  }
}
