import '../theme/soft_theme.dart';
import '../utils/money.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import '../widgets/order_status_badge.dart';
import 'order_detail_screen.dart';

/// Detalle de un cliente: datos (desde `customers/{phone}` si existe, si no
/// desde el pedido más reciente) + todos sus pedidos ordenados por fecha.
/// Se abre desde el detalle del pedido y desde el nombre de un cliente
/// registrado en la tarjeta de visitas.
class CustomerDetailScreen extends StatelessWidget {
  const CustomerDetailScreen({
    super.key,
    required this.name,
    required this.phone,
  });

  final String name;
  final String phone;

  static final DateFormat dateFormat = DateFormat('dd/MM/yyyy HH:mm');
  static const CopFormat cop = CopFormat();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SoftTheme.background,
      appBar:
          AppBar(title: Text(name.isNotEmpty ? name : 'Detalle del cliente')),
      body: Column(
        children: [
          _CustomerHeader(phone: phone, fallbackName: name),
          Expanded(child: _CustomerOrders(phone: phone)),
        ],
      ),
    );
  }
}

class _CustomerHeader extends StatelessWidget {
  const _CustomerHeader({required this.phone, required this.fallbackName});

  final String phone;
  final String fallbackName;

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: StreamBuilder<DocumentSnapshot>(
        stream: FirebaseFirestore.instance
            .collection('customers')
            .doc(phone)
            .snapshots(),
        builder: (context, snap) {
          final data = snap.hasData && snap.data!.exists
              ? snap.data!.data() as Map<String, dynamic>
              : <String, dynamic>{};
          final displayName =
              (data['name']?.toString().trim().isNotEmpty == true)
                  ? data['name'].toString()
                  : fallbackName;
          final email = data['email']?.toString() ?? '-';
          final address = data['address']?.toString() ?? '-';
          return ShadCard(
            width: double.infinity,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                          child: Text(displayName.isNotEmpty
                              ? displayName[0].toUpperCase()
                              : '?')),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                                displayName.isNotEmpty
                                    ? displayName
                                    : 'Cliente sin nombre',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700, fontSize: 16)),
                            const SizedBox(height: 2),
                            Text(phone, style: theme.textTheme.muted),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text('Correo: $email', style: theme.textTheme.small),
                  Text('Dirección: $address', style: theme.textTheme.small),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _CustomerOrders extends StatelessWidget {
  const _CustomerOrders({required this.phone});

  final String phone;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('orders')
          .where('customerPhone', isEqualTo: phone)
          .snapshots(),
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(
              child: Text('No se pudieron cargar los pedidos: ${snap.error}'));
        }
        if (!snap.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final docs = [...snap.data!.docs]..sort((a, b) {
            final ta =
                (a.data() as Map<String, dynamic>)['createdAt'] as Timestamp?;
            final tb =
                (b.data() as Map<String, dynamic>)['createdAt'] as Timestamp?;
            return (tb?.toDate() ?? DateTime.fromMillisecondsSinceEpoch(0))
                .compareTo(
                    ta?.toDate() ?? DateTime.fromMillisecondsSinceEpoch(0));
          });
        if (docs.isEmpty) {
          return const Center(
              child: Text('Este cliente aún no tiene pedidos registrados.'));
        }
        return ListView.builder(
          padding: const EdgeInsets.fromLTRB(0, 4, 0, 16),
          itemCount: docs.length,
          itemBuilder: (context, i) {
            final d = docs[i];
            final data = d.data() as Map<String, dynamic>;
            final status = data['status']?.toString() ?? 'pending';
            final total = (data['total'] as num?)?.toDouble() ?? 0;
            final ts = data['createdAt'] as Timestamp?;
            final date = ts == null
                ? '-'
                : CustomerDetailScreen.dateFormat.format(ts.toDate());
            return Card(
              elevation: 0,
              margin: const EdgeInsets.fromLTRB(16, 4, 16, 4),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: BorderSide(
                    color: Theme.of(context).colorScheme.outlineVariant),
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                      builder: (_) =>
                          OrderDetailScreen(orderId: d.id, data: data)),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Pedido #${d.id}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800)),
                            const SizedBox(height: 2),
                            Text(
                                '$date · ${CustomerDetailScreen.cop.format(total)}',
                                style: TextStyle(
                                    fontSize: 12,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant)),
                          ],
                        ),
                      ),
                      OrderStatusBadge(status),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}
