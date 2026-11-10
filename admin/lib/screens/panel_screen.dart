import 'package:flutter/material.dart';
import '../theme/soft_theme.dart';
import '../widgets/visits_stats_card.dart';
import 'orders_screen.dart';

/// Página principal (Panel): estado de la tienda. Ya no lista productos:
/// muestra visitas (hoy + historial, con detalle por día y por cliente) y,
/// debajo, la lista de pedidos (antes en el menú "Pedidos").
class PanelScreen extends StatelessWidget {
  const PanelScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Visitas: el detalle de hoy y el historial de días anteriores.
          const VisitsStatsCard(),
          const SizedBox(height: 16),
          const Text(
            'Pedidos',
            style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 16,
                color: SoftTheme.text),
          ),
          const SizedBox(height: 4),
          const Text(
            'Toca un pedido para ver su detalle y cambiar su estado.',
            style: TextStyle(fontSize: 12, color: SoftTheme.textMuted),
          ),
          const SizedBox(height: 8),
          // La lista completa de pedidos (filtros por estado + tiles).
          const OrdersList(embedded: true),
        ],
      ),
    );
  }
}
