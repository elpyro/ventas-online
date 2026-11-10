import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../screens/catalog_products_screen.dart';
import '../services/search_normalizer.dart';
import '../theme/soft_theme.dart';
import '../utils/money.dart';
import 'catalog_edit_screen.dart';

/// Compra mínima en pesos colombianos, por ejemplo "$ 20.000".
const CopFormat _copFormat = CopFormat(decimals: 0);
String _cop(num? value) => _copFormat.format(value);

class CatalogsScreen extends StatefulWidget {
  const CatalogsScreen({super.key});

  @override
  State<CatalogsScreen> createState() => _CatalogsScreenState();
}

class _CatalogsScreenState extends State<CatalogsScreen> {
  String query = '';

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search),
                    hintText: 'Buscar catálogo…',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                    filled: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  onChanged: (value) =>
                      setState(() => query = SearchNormalizer.normalize(value)),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                icon: const Icon(Icons.add),
                tooltip: 'Nuevo catálogo',
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const CatalogEditScreen(),
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: StreamBuilder<QuerySnapshot>(
            stream:
                FirebaseFirestore.instance.collection('catalogs').snapshots(),
            builder: (context, snap) {
              if (snap.hasError) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                        'No se pudieron cargar los catálogos: ${snap.error}'),
                  ),
                );
              }
              if (!snap.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              final docs = snap.data!.docs.where((doc) {
                if (query.isEmpty) return true;
                final d = doc.data() as Map<String, dynamic>;
                final haystack =
                    SearchNormalizer.normalize('${doc.id} ${d['title'] ?? ''}');
                return haystack.contains(query);
              }).toList();

              docs.sort((a, b) {
                final pa =
                    (a.data() as Map<String, dynamic>)['priority'] as int? ?? 0;
                final pb =
                    (b.data() as Map<String, dynamic>)['priority'] as int? ?? 0;
                return pa.compareTo(pb);
              });

              if (docs.isEmpty) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: Text('Ningún catálogo coincide con la búsqueda.'),
                  ),
                );
              }

              return ListView.builder(
                itemCount: docs.length,
                itemBuilder: (context, i) {
                  final d = docs[i];
                  final data = d.data() as Map<String, dynamic>;
                  final active = data['isActive'] == true;
                  final visible = data['isVisible'] == true;
                  final cover = (data['coverImage'] as String?)?.trim() ?? '';
                  return SoftTile(
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => CatalogProductsScreen(
                          catalogId: d.id,
                          catalogTitle: data['title']?.toString() ?? d.id,
                        ),
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 56,
                          height: 56,
                          decoration: BoxDecoration(
                            borderRadius:
                                BorderRadius.circular(SoftTheme.radiusThumb),
                            boxShadow: SoftTheme.thumbShadow,
                          ),
                          child: ClipRRect(
                            borderRadius:
                                BorderRadius.circular(SoftTheme.radiusThumb),
                            child: cover.isNotEmpty
                                ? Image.network(
                                    cover,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Container(
                                      color: SoftTheme.inputBg,
                                      child: const Icon(Icons.grid_view,
                                          color: SoftTheme.textMuted),
                                    ),
                                  )
                                : Container(
                                    color: SoftTheme.inputBg,
                                    child: const Icon(Icons.grid_view,
                                        color: SoftTheme.textMuted),
                                  ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                data['title']?.toString() ?? d.id,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 15,
                                    color: SoftTheme.text),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4),
                              Wrap(
                                spacing: 6,
                                children: [
                                  SoftBadge(
                                    text: 'ID: ${d.id}',
                                    color: SoftTheme.textMuted,
                                    size: 11,
                                  ),
                                  _ProductCount(catalogId: d.id),
                                  SoftBadge(
                                    text:
                                        'Mín. ${_cop(data['minOrderSubtotal'] as num?)}',
                                    color: SoftTheme.cBlue,
                                    size: 11,
                                  ),
                                  SoftBadge(
                                    text: 'Orden ${data['priority'] ?? 0}',
                                    color: SoftTheme.textMuted,
                                    size: 11,
                                  ),
                                  if (!active)
                                    SoftBadge(
                                        text: 'Inactivo',
                                        color: SoftTheme.cRose,
                                        size: 11),
                                  if (!visible)
                                    SoftBadge(
                                        text: 'Oculto',
                                        color: SoftTheme.cRose,
                                        size: 11),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right,
                            size: 20, color: SoftTheme.textMuted),
                      ],
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
}

/// Badge con la cantidad de productos del catálogo. Usa la agregación
/// count() de Firestore: cuenta en el servidor sin traer los documentos.
class _ProductCount extends StatefulWidget {
  const _ProductCount({required this.catalogId});

  final String catalogId;

  @override
  State<_ProductCount> createState() => _ProductCountState();
}

class _ProductCountState extends State<_ProductCount> {
  late final Future<int> _future;

  @override
  void initState() {
    super.initState();
    _future = FirebaseFirestore.instance
        .collection('products')
        .where('catalogIds', arrayContains: widget.catalogId)
        .count()
        .get()
        .then((snap) => snap.count ?? 0);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<int>(
      future: _future,
      builder: (context, snap) {
        final n = snap.data;
        return SoftBadge(
          text: n == null ? '…' : (n == 1 ? '1 producto' : '$n productos'),
          color: SoftTheme.cEmerald,
          icon: Icons.inventory_2,
          size: 11,
        );
      },
    );
  }
}
