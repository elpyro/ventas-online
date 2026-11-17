import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../utils/money.dart';
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
          const SizedBox(height: 16),
          const Text(
            'Top clientes',
            style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 16,
                color: SoftTheme.text),
          ),
          const SizedBox(height: 4),
          const _TopClientsList(),
          const SizedBox(height: 16),
          // La lista completa de pedidos (filtros por estado + tiles).
          const OrdersList(embedded: true),
        ],
      ),
    );
  }
}

class _TopClientsList extends StatelessWidget {
  const _TopClientsList();

  static const CopFormat cop = CopFormat();

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('customers')
          .orderBy('totalSpent', descending: true)
          .limit(5)
          .snapshots(),
      builder: (context, snap) {
        if (!snap.hasData) {
          return const SizedBox.shrink();
        }
        final docs = snap.data!.docs;
        if (docs.isEmpty) {
          return const Text('Sin clientes aún.',
              style: TextStyle(fontSize: 12, color: SoftTheme.textMuted));
        }
        return Column(
          children: docs.map((d) {
            final data = d.data() as Map<String, dynamic>;
            final name = data['name']?.toString() ?? 'Cliente';
            final total = (data['totalSpent'] as num?)?.toDouble() ?? 0;
            final count = (data['orderCount'] as num?)?.toInt() ?? 0;
            return ListTile(
              dense: true,
              leading: const Icon(Icons.person_outline),
              title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text('$count pedido(s)'),
              trailing: Text(cop.format(total),
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            );
          }).toList(),
        );
      },
    );
  }
}
