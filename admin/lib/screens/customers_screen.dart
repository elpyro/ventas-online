import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/soft_theme.dart';
import '../utils/money.dart';
import 'customer_detail_screen.dart';

/// Pantalla de gestión de clientes (CRM).
/// Lista todas las fichas de `customers/{phone}` con búsqueda y métricas.
class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  static final DateFormat dateFormat = DateFormat('dd/MM/yyyy');
  static const CopFormat cop = CopFormat();

  String _query = '';
  String _statusFilter = 'todos';

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: TextField(
            decoration: const InputDecoration(
              hintText: 'Buscar por nombre o teléfono',
              prefixIcon: Icon(Icons.search),
              border: OutlineInputBorder(),
            ),
            onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
          child: Wrap(
            spacing: 6,
            children: ['todos', 'active', 'vip', 'inactive', 'lead'].map((f) {
              final label = switch (f) {
                'todos' => 'Todos',
                'active' => 'Activos',
                'vip' => 'VIP',
                'inactive' => 'Inactivos',
                'lead' => 'Leads',
                _ => f,
              };
              final selected = _statusFilter == f;
              return ChoiceChip(
                label: Text(label),
                selected: selected,
                onSelected: (_) => setState(() => _statusFilter = f),
              );
            }).toList(),
          ),
        ),
        Expanded(
          child: StreamBuilder<QuerySnapshot>(
            stream: FirebaseFirestore.instance.collection('customers').snapshots(),
            builder: (context, snap) {
              if (snap.hasError) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text('No se pudieron cargar los clientes: ${snap.error}'),
                  ),
                );
              }
              if (!snap.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              final docs = [...snap.data!.docs]
                ..sort((a, b) {
                  final da = a.data() as Map<String, dynamic>;
                  final db = b.data() as Map<String, dynamic>;
                  final ta = (da['lastOrderAt'] as Timestamp?)?.toDate() ??
                      (da['createdAt'] as Timestamp?)?.toDate() ??
                      DateTime.fromMillisecondsSinceEpoch(0);
                  final tb = (db['lastOrderAt'] as Timestamp?)?.toDate() ??
                      (db['createdAt'] as Timestamp?)?.toDate() ??
                      DateTime.fromMillisecondsSinceEpoch(0);
                  return tb.compareTo(ta);
                });

              final filtered = docs.where((d) {
                final data = d.data() as Map<String, dynamic>;
                final st = data['status']?.toString() ?? 'active';
                if (_statusFilter != 'todos' && st != _statusFilter) return false;
                if (_query.isEmpty) return true;
                final name = (data['name']?.toString() ?? '').toLowerCase();
                final phone = (data['phone']?.toString() ?? d.id).toLowerCase();
                return name.contains(_query) || phone.contains(_query);
              }).toList();

              if (filtered.isEmpty) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text(
                      _query.isEmpty
                          ? 'Aún no hay clientes registrados.'
                          : 'Sin resultados para "$_query".',
                      textAlign: TextAlign.center,
                    ),
                  ),
                );
              }

              return ListView.builder(
                padding: const EdgeInsets.only(bottom: 16),
                itemCount: filtered.length,
                itemBuilder: (context, i) {
                  final d = filtered[i];
                  final data = d.data() as Map<String, dynamic>;
                  final phone = (data['phone']?.toString().trim().isNotEmpty == true)
                      ? data['phone'].toString()
                      : d.id;
                  final name = (data['name']?.toString().trim().isNotEmpty == true)
                      ? data['name'].toString()
                      : 'Cliente sin nombre';
                  final status = data['status']?.toString() ?? 'active';
                  final orderCount = (data['orderCount'] as num?)?.toInt() ?? 0;
                  final totalSpent =
                      (data['totalSpent'] as num?)?.toDouble() ?? 0;
                  final lastOrderAt = (data['lastOrderAt'] as Timestamp?)?.toDate();
                  return Card(
                    elevation: 0,
                    margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: BorderSide(
                        color: Theme.of(context).colorScheme.outlineVariant,
                      ),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => CustomerDetailScreen(
                            name: name,
                            phone: phone,
                          ),
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          children: [
                            CircleAvatar(
                              child: Text(
                                name.isNotEmpty ? name[0].toUpperCase() : '?',
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 15,
                                      color: SoftTheme.text,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    phone,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: SoftTheme.textMuted,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Row(
                                    children: [
                                      _statusChip(status),
                                      const SizedBox(width: 8),
                                      Text(
                                        '$orderCount pedido(s) · ${cop.format(totalSpent)}',
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: SoftTheme.textMuted,
                                        ),
                                      ),
                                    ],
                                  ),
                                  if (lastOrderAt != null)
                                    Text(
                                      'Última compra: ${dateFormat.format(lastOrderAt)}',
                                      style: const TextStyle(
                                        fontSize: 11,
                                        color: SoftTheme.textMuted,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            const Icon(Icons.chevron_right),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _statusChip(String status) {
    final color = switch (status) {
      'vip' => SoftTheme.cAmber,
      'inactive' => SoftTheme.cRose,
      'lead' => SoftTheme.cBlue,
      _ => SoftTheme.cEmerald,
    };
    final label = switch (status) {
      'vip' => 'VIP',
      'inactive' => 'Inactivo',
      'lead' => 'Lead',
      _ => 'Activo',
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}
