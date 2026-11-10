import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/soft_theme.dart';
import '../utils/money.dart';
import '../widgets/order_status_badge.dart';
import 'order_detail_screen.dart';

/// Pipeline: todos / seleccionando / pendientes / preparando / listo / enviados / cancelados.
enum OrderFilter {
  todos,
  selecting,
  pending,
  preparing,
  ready,
  dispatched,
  cancelled
}

String orderFilterLabel(OrderFilter f) {
  switch (f) {
    case OrderFilter.todos:
      return 'Todos';
    case OrderFilter.selecting:
      return 'Seleccionando';
    case OrderFilter.pending:
      return 'Pendientes';
    case OrderFilter.preparing:
      return 'Preparando';
    case OrderFilter.ready:
      return 'Listos';
    case OrderFilter.dispatched:
      return 'Enviados';
    case OrderFilter.cancelled:
      return 'Cancelados';
  }
}

String? orderFilterStatus(OrderFilter f) {
  switch (f) {
    case OrderFilter.todos:
      return null;
    case OrderFilter.selecting:
      return 'selecting';
    case OrderFilter.pending:
      return 'pending';
    case OrderFilter.preparing:
      return 'preparing';
    case OrderFilter.ready:
      return 'ready';
    case OrderFilter.dispatched:
      return 'dispatched';
    case OrderFilter.cancelled:
      return 'cancelled';
  }
}

class OrdersScreen extends StatelessWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context) => const OrdersList();
}

/// Lista de pedidos reutilizable: pantalla completa o embebida en el Panel.
/// En modo `embedded` se deja que el padre haga scroll (para meterla debajo
/// de la tarjeta de visitas sin nested-scroll).
class OrdersList extends StatefulWidget {
  const OrdersList({super.key, this.embedded = false});

  final bool embedded;

  @override
  State<OrdersList> createState() => _OrdersListState();
}

class _OrdersListState extends State<OrdersList> {
  OrderFilter filter = OrderFilter.todos;

  static final DateFormat dateFormat = DateFormat('dd/MM/yyyy HH:mm');
  static const CopFormat cop = CopFormat();

  void _setFilter(OrderFilter f) {
    if (filter == f) return;
    setState(() => filter = f);
  }

  void _moveFilter(int delta) {
    final cur = OrderFilter.values.indexOf(filter);
    final next = (cur + delta).clamp(0, OrderFilter.values.length - 1);
    _setFilter(OrderFilter.values[next]);
  }

  @override
  Widget build(BuildContext context) {
    final chips = SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        children: OrderFilter.values.map((f) {
          final selected = filter == f;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Text(orderFilterLabel(f)),
              selected: selected,
              onSelected: (_) => _setFilter(f),
              selectedColor: SoftTheme.cBlue.withValues(alpha: 0.9),
              labelStyle: TextStyle(
                color: selected ? Colors.white : null,
                fontWeight: FontWeight.w700,
              ),
            ),
          );
        }).toList(),
      ),
    );

    final list = StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance.collection('orders').snapshots(),
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('No se pudieron cargar los pedidos: ${snap.error}'),
            ),
          );
        }
        if (!snap.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        var docs = [...snap.data!.docs];
        DateTime sortDate(QueryDocumentSnapshot d) {
          final data = d.data() as Map<String, dynamic>;
          // Para Seleccionando usa la fecha de última selección (updatedAt)
          // para que no aparezca de último en la lista.
          final ts = data['status']?.toString() == 'selecting'
              ? (data['updatedAt'] as Timestamp?) ??
                  (data['createdAt'] as Timestamp?)
              : (data['updatedAt'] as Timestamp?) ??
                  (data['createdAt'] as Timestamp?);
          return ts?.toDate() ?? DateTime.fromMillisecondsSinceEpoch(0);
        }

        docs.sort((a, b) => sortDate(b).compareTo(sortDate(a)));
        final statusFilter = orderFilterStatus(filter);
        docs = docs.where((d) {
          if (statusFilter == null) return true;
          final status =
              (d.data() as Map<String, dynamic>)['status']?.toString();
          return status == statusFilter;
        }).toList();

        if (docs.isEmpty) {
          // Altura mínima para que el swipe horizontal siga recibiendo el gesto
          // aunque no haya pedidos (antes el Center era muy chico y no dejaba hacer scroll).
          return SizedBox(
            height: 180,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  statusFilter == null
                      ? 'Aún no hay pedidos.'
                      : 'No hay pedidos en este estado.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ),
            ),
          );
        }
        if (widget.embedded) {
          // El scroll lo hace el padre (SingleChildScrollView del Panel).
          return Column(
            children: [
              for (final d in docs) _OrderTile(doc: d),
              const SizedBox(height: 8),
            ],
          );
        }
        return ListView.builder(
          itemCount: docs.length,
          padding: const EdgeInsets.only(bottom: 16),
          itemBuilder: (context, i) => _OrderTile(doc: docs[i]),
        );
      },
    );

    final swipeable = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onHorizontalDragEnd: (d) {
        final v = d.primaryVelocity ?? 0;
        if (v < -20) _moveFilter(1);
        if (v > 20) _moveFilter(-1);
      },
      child: list,
    );

    if (widget.embedded) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [chips, swipeable],
      );
    }
    return Column(
      children: [chips, Expanded(child: swipeable)],
    );
  }

  static String formatDate(Timestamp? ts) =>
      ts == null ? '-' : dateFormat.format(ts.toDate());

  static String formatCop(num? value) => cop.format(value ?? 0);
}

class _OrderTile extends StatelessWidget {
  const _OrderTile({required this.doc});

  final QueryDocumentSnapshot doc;

  @override
  Widget build(BuildContext context) {
    final data = doc.data() as Map<String, dynamic>;
    final status = data['status']?.toString() ?? 'pending';
    final items = (data['items'] as List?) ?? const [];
    final total = (data['total'] as num?)?.toDouble() ?? 0;
    final name = data['customerName']?.toString().trim();
    final phone = data['customerPhone']?.toString() ?? '';
    final dateTs = status == 'selecting'
        ? (data['updatedAt'] as Timestamp?) ?? (data['createdAt'] as Timestamp?)
        : (data['createdAt'] as Timestamp?) ??
            (data['updatedAt'] as Timestamp?);
    final date = _OrdersListState.formatDate(dateTs);
    final units = items.fold<int>(
      0,
      (sum, raw) =>
          sum +
          (((raw as Map<String, dynamic>?)?['quantity'] as num?)?.toInt() ?? 0),
    );

    return SoftTile(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      padding: const EdgeInsets.all(12),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => OrderDetailScreen(orderId: doc.id, data: data),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  name?.isNotEmpty == true ? name! : 'Cliente sin nombre',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: SoftTheme.text),
                ),
              ),
              OrderStatusBadge(status),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            'Pedido #${doc.id}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: SoftTheme.textMuted),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  '$phone · $units uds',
                  style:
                      const TextStyle(fontSize: 12, color: SoftTheme.textMuted),
                ),
              ),
              SoftBadge(
                text: _OrdersListState.formatCop(total),
                color: SoftTheme.cEmerald,
                size: 15,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            date,
            style: const TextStyle(fontSize: 11, color: SoftTheme.textMuted),
          ),
        ],
      ),
    );
  }
}
