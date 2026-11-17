import '../theme/soft_theme.dart';
import '../utils/money.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import '../widgets/order_status_badge.dart';
import 'order_detail_screen.dart';

/// Detalle de un cliente: datos (desde `customers/{phone}`) + métricas CRM +
/// etiquetas + notas + todos sus pedidos ordenados por fecha.
class CustomerDetailScreen extends StatefulWidget {
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
  State<CustomerDetailScreen> createState() => _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends State<CustomerDetailScreen> {
  final TextEditingController _tagController = TextEditingController();
  final TextEditingController _noteController = TextEditingController();

  @override
  void dispose() {
    _tagController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  DocumentReference<Map<String, dynamic>> get _ref =>
      FirebaseFirestore.instance.collection('customers').doc(widget.phone);

  Future<void> _addTag(String tag) async {
    final t = tag.trim();
    if (t.isEmpty) return;
    await _ref.set(
      {
        'tags': FieldValue.arrayUnion([t]),
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Future<void> _removeTag(String tag) async {
    await _ref.set(
      {
        'tags': FieldValue.arrayRemove([tag]),
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Future<void> _addNote() async {
    final text = _noteController.text.trim();
    if (text.isEmpty) return;
    await _ref.set(
      {
        'notes': FieldValue.arrayUnion([
          {
            'at': Timestamp.now(),
            'by': 'admin',
            'text': text,
          }
        ]),
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
    _noteController.clear();
  }

  Future<void> _removeNote(Map<String, dynamic> note) async {
    await _ref.set(
      {
        'notes': FieldValue.arrayRemove([note]),
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SoftTheme.background,
      appBar: AppBar(
        title: Text(widget.name.isNotEmpty ? widget.name : 'Detalle del cliente'),
      ),
      body: Column(
        children: [
          _CustomerHeader(
            phone: widget.phone,
            fallbackName: widget.name,
            onAddTag: _addTag,
            tagController: _tagController,
          ),
          _CustomerMetrics(phone: widget.phone),
          _CustomerTags(phone: widget.phone, onRemove: _removeTag),
          _CustomerNotes(
            phone: widget.phone,
            controller: _noteController,
            onAdd: _addNote,
            onRemove: _removeNote,
          ),
          Expanded(child: _CustomerOrders(phone: widget.phone)),
        ],
      ),
    );
  }
}

class _CustomerHeader extends StatelessWidget {
  const _CustomerHeader({
    required this.phone,
    required this.fallbackName,
    required this.onAddTag,
    required this.tagController,
  });

  final String phone;
  final String fallbackName;
  final Future<void> Function(String) onAddTag;
  final TextEditingController tagController;

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
                            : '?'),
                      ),
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
                                  fontWeight: FontWeight.w700, fontSize: 16),
                            ),
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
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: tagController,
                          decoration: const InputDecoration(
                            hintText: 'Nueva etiqueta',
                            isDense: true,
                            border: OutlineInputBorder(),
                          ),
                          onSubmitted: (v) async {
                            await onAddTag(v);
                            tagController.clear();
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        icon: const Icon(Icons.add),
                        onPressed: () async {
                          await onAddTag(tagController.text);
                          tagController.clear();
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _CustomerMetrics extends StatelessWidget {
  const _CustomerMetrics({required this.phone});

  final String phone;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance
          .collection('customers')
          .doc(phone)
          .snapshots(),
      builder: (context, snap) {
        if (!snap.hasData || !snap.data!.exists) return const SizedBox.shrink();
        final data = snap.data!.data() as Map<String, dynamic>;
        final orderCount = (data['orderCount'] as num?)?.toInt() ?? 0;
        final totalSpent = (data['totalSpent'] as num?)?.toDouble() ?? 0;
        final avgTicket = (data['avgTicket'] as num?)?.toDouble() ?? 0;
        final firstOrderAt = (data['firstOrderAt'] as Timestamp?)?.toDate();
        final lastOrderAt = (data['lastOrderAt'] as Timestamp?)?.toDate();
        final status = data['status']?.toString() ?? 'active';
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: ShadCard(
            width: double.infinity,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Wrap(
                spacing: 16,
                runSpacing: 8,
                children: [
                  _metric('Estado', status.toUpperCase()),
                  _metric('Pedidos', '$orderCount'),
                  _metric('Total gastado', CustomerDetailScreen.cop.format(totalSpent)),
                  _metric('Ticket prom.', CustomerDetailScreen.cop.format(avgTicket)),
                  if (firstOrderAt != null)
                    _metric('Primera compra', CustomerDetailScreen.dateFormat.format(firstOrderAt).split(' ')[0]),
                  if (lastOrderAt != null)
                    _metric('Última compra', CustomerDetailScreen.dateFormat.format(lastOrderAt).split(' ')[0]),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _metric(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: const TextStyle(fontSize: 10, color: SoftTheme.textMuted)),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
      ],
    );
  }
}

class _CustomerTags extends StatelessWidget {
  const _CustomerTags({required this.phone, required this.onRemove});

  final String phone;
  final Future<void> Function(String) onRemove;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot>(
      stream: FirebaseFirestore.instance
          .collection('customers')
          .doc(phone)
          .snapshots(),
      builder: (context, snap) {
        if (!snap.hasData || !snap.data!.exists) return const SizedBox.shrink();
        final data = snap.data!.data() as Map<String, dynamic>;
        final tags = (data['tags'] as List?)?.cast<String>() ?? const <String>[];
        if (tags.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: Wrap(
            spacing: 6,
            runSpacing: 6,
            children: tags
                .map((t) => Chip(
                      label: Text(t),
                      onDeleted: () => onRemove(t),
                    ))
                .toList(),
          ),
        );
      },
    );
  }
}

class _CustomerNotes extends StatelessWidget {
  const _CustomerNotes({
    required this.phone,
    required this.controller,
    required this.onAdd,
    required this.onRemove,
  });

  final String phone;
  final TextEditingController controller;
  final Future<void> Function() onAdd;
  final Future<void> Function(Map<String, dynamic>) onRemove;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  decoration: const InputDecoration(
                    hintText: 'Agregar nota...',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => onAdd(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(icon: const Icon(Icons.note_add), onPressed: onAdd),
            ],
          ),
          StreamBuilder<DocumentSnapshot>(
            stream: FirebaseFirestore.instance
                .collection('customers')
                .doc(phone)
                .snapshots(),
            builder: (context, snap) {
              if (!snap.hasData || !snap.data!.exists) {
                return const SizedBox.shrink();
              }
              final data = snap.data!.data() as Map<String, dynamic>;
              final notes = (data['notes'] as List?) ?? const [];
              if (notes.isEmpty) return const SizedBox.shrink();
              return Column(
                children: notes.map((raw) {
                  final note = (raw as Map).cast<String, dynamic>();
                  final text = note['text']?.toString() ?? '';
                  final ts = note['at'] as Timestamp?;
                  final date = ts == null
                      ? ''
                      : DateFormat('dd/MM/yyyy HH:mm').format(ts.toDate());
                  return Card(
                    elevation: 0,
                    margin: const EdgeInsets.only(top: 6),
                    child: ListTile(
                      title: Text(text),
                      subtitle: Text(date),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () => onRemove(note),
                      ),
                    ),
                  );
                }).toList(),
              );
            },
          ),
        ],
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
            child: Text('No se pudieron cargar los pedidos: ${snap.error}'),
          );
        }
        if (!snap.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final docs = [...snap.data!.docs]..sort((a, b) {
            final ta = (a.data() as Map<String, dynamic>)['createdAt'] as Timestamp?;
            final tb = (b.data() as Map<String, dynamic>)['createdAt'] as Timestamp?;
            return (tb?.toDate() ?? DateTime.fromMillisecondsSinceEpoch(0))
                .compareTo(
                    ta?.toDate() ?? DateTime.fromMillisecondsSinceEpoch(0));
          });
        if (docs.isEmpty) {
          return const Center(
            child: Text('Este cliente aún no tiene pedidos registrados.'),
          );
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
                        OrderDetailScreen(orderId: d.id, data: data),
                  ),
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
                                    .onSurfaceVariant,
                              ),
                            ),
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
