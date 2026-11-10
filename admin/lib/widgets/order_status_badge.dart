import 'package:flutter/material.dart';
import '../theme/soft_theme.dart';

/// Etiquetas llamativas de estado del pedido — colores distintos y vivos.
class OrderStatusBadge extends StatelessWidget {
  const OrderStatusBadge(this.status, {super.key, this.short = false});

  final String status;
  final bool short;

  static const Map<String, String> labels = {
    'selecting': 'Seleccionando',
    'pending': 'Pendiente',
    'preparing': 'Preparando',
    'ready': 'Listo',
    'dispatched': 'Enviado',
    'cancelled': 'Cancelado',
  };

  static String label(String status) => labels[status] ?? status;

  static const List<String> all = [
    'selecting',
    'pending',
    'preparing',
    'ready',
    'dispatched',
    'cancelled',
  ];

  @override
  Widget build(BuildContext context) {
    final c = SoftTheme.orderColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: c.withValues(alpha: 0.18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: c, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text(
            label(status),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: c,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}
