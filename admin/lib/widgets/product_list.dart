import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../screens/product_edit_screen.dart';
import '../services/search_normalizer.dart';
import '../theme/soft_theme.dart';
import '../utils/money.dart';

enum ProductFilter { todos, disponibles, agotados, destacados }

enum ProductSort {
  nameAsc,
  priceAsc,
  priceDesc,
  stockDesc,
  featuredFirst,
  displayOrder
}

String productFilterLabel(ProductFilter f) {
  switch (f) {
    case ProductFilter.todos:
      return 'Todos';
    case ProductFilter.disponibles:
      return 'Disponibles';
    case ProductFilter.agotados:
      return 'Agotados';
    case ProductFilter.destacados:
      return 'Destacados';
  }
}

String productSortLabel(ProductSort s) {
  switch (s) {
    case ProductSort.nameAsc:
      return 'Nombre A-Z';
    case ProductSort.priceAsc:
      return 'Precio: menor a mayor';
    case ProductSort.priceDesc:
      return 'Precio: mayor a menor';
    case ProductSort.stockDesc:
      return 'Más stock primero';
    case ProductSort.featuredFirst:
      return 'Destacados primero';
    case ProductSort.displayOrder:
      return 'Orden de tienda (web)';
  }
}

/// Precio en pesos colombianos (COP) con dos decimales: "$ 45,90".
const CopFormat _copFormat = CopFormat();
String _cop(double value) => _copFormat.format(value);

/// Stock total respetando variantes (igual que la web): si hay variantes, se
/// suma su stock; si no, se usa el `stock` del producto.
int _totalStock(Map<String, dynamic> d) {
  final variants = (d['variants'] as List?) ?? const [];
  if (variants.isNotEmpty) {
    var sum = 0;
    for (final v in variants) {
      if (v is Map) sum += (v['stock'] as num?)?.toInt() ?? 0;
    }
    return sum;
  }
  return (d['stock'] as num?)?.toInt() ?? 0;
}

bool _isAvailable(Map<String, dynamic> d, int stock) {
  if (stock <= 0) return false;
  final variants = (d['variants'] as List?) ?? const [];
  if (variants.isNotEmpty) return true;
  return d['isAvailable'] == true;
}

/// Lista de productos con búsqueda sin tildes, filtro por disponibilidad y
/// orden. La usan la pestaña Productos y el detalle de cada catálogo.
class ProductList extends StatefulWidget {
  /// Si es null muestra todos los productos; si se indica, solo los del catálogo.
  const ProductList({super.key, this.catalogId});

  final String? catalogId;

  @override
  State<ProductList> createState() => _ProductListState();
}

class _ProductListState extends State<ProductList> {
  String query = '';
  ProductFilter filter = ProductFilter.todos;
  late ProductSort sort;
  late final Stream<QuerySnapshot> _stream;

  @override
  void initState() {
    super.initState();
    // Dentro de un catálogo, el orden por defecto es el visible en la web.
    sort = widget.catalogId == null
        ? ProductSort.nameAsc
        : ProductSort.displayOrder;
    // Stream creado una sola vez: antes se recreaba en cada build y Flutter
    // re-suscribía la escucha (más lecturas/red sin que cambie nada).
    _stream = widget.catalogId == null
        ? FirebaseFirestore.instance.collection('products').snapshots()
        : FirebaseFirestore.instance
            .collection('products')
            .where('catalogIds', arrayContains: widget.catalogId)
            .snapshots();
  }

  @override
  Widget build(BuildContext context) {
    final stream = _stream;

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
                    hintText: widget.catalogId == null
                        ? 'Buscar por nombre, marca o código…'
                        : 'Buscar en este catálogo…',
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
              const SizedBox(width: 4),
              PopupMenuButton<ProductSort>(
                icon: const Icon(Icons.sort),
                tooltip: 'Ordenar',
                initialValue: sort,
                onSelected: (value) async {
                  setState(() => sort = value);
                  if (value == ProductSort.displayOrder) return;
                  if (!mounted) return;
                  final apply = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Aplicar orden a la web'),
                      content: Text(
                          '¿Quieres que el catálogo web (cliente) use este orden?\n\n"${productSortLabel(value)}"\n\nSe reordenarán todos los productos y se guardará el nuevo orden.'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Solo aquí'),
                        ),
                        ElevatedButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Sí, aplicar a la web'),
                        ),
                      ],
                    ),
                  );
                  if (apply == true && mounted) {
                    await _applySortToWeb();
                  }
                },
                itemBuilder: (context) => ProductSort.values
                    .map((e) => PopupMenuItem(
                          value: e,
                          child: Text(productSortLabel(e)),
                        ))
                    .toList(),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 44,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            children: ProductFilter.values
                .map((f) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(productFilterLabel(f)),
                        selected: filter == f,
                        onSelected: (_) => setState(() => filter = f),
                      ),
                    ))
                .toList(),
          ),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: StreamBuilder<QuerySnapshot>(
            stream: stream,
            builder: (context, snap) {
              if (snap.hasError) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                        'No se pudieron cargar los productos: ${snap.error}'),
                  ),
                );
              }
              if (!snap.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              var docs = snap.data!.docs.where(_matches).toList();
              _applySort(docs);

              if (docs.isEmpty) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text(
                      query.isEmpty
                          ? 'No hay productos para este filtro.'
                          : 'Ningún producto coincide con la búsqueda.',
                      textAlign: TextAlign.center,
                    ),
                  ),
                );
              }
              return ListView.builder(
                itemCount: docs.length,
                padding: const EdgeInsets.only(bottom: 16),
                itemBuilder: (context, i) => _ProductTile(doc: docs[i]),
              );
            },
          ),
        ),
      ],
    );
  }

  bool _matches(QueryDocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    final stock = _totalStock(d);
    final available = _isAvailable(d, stock);
    switch (filter) {
      case ProductFilter.disponibles:
        if (!available) return false;
        break;
      case ProductFilter.agotados:
        if (available) return false;
        break;
      case ProductFilter.destacados:
        if (d['featured'] != true) return false;
        break;
      case ProductFilter.todos:
        break;
    }
    if (query.isEmpty) return true;
    final haystack = SearchNormalizer.normalize([
      doc.id,
      d['name'],
      d['brand'],
      d['description'],
      (d['tags'] as List?)?.join(' '),
    ].map((e) => (e ?? '').toString()).join(' '));
    return query.split(' ').every(haystack.contains);
  }

  /// Reordena TODOS los productos según el sort actual y guarda el nuevo
  /// `priority` en Firestore para que la web (cliente) muestre el mismo orden.
  Future<void> _applySortToWeb() async {
    try {
      final snap =
          await FirebaseFirestore.instance.collection('products').get();
      var docs = snap.docs.toList();
      _applySort(docs);
      final batch = FirebaseFirestore.instance.batch();
      for (var i = 0; i < docs.length; i++) {
        batch.update(docs[i].reference, {'priority': i + 1});
      }
      await batch.commit();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Orden aplicado a la web')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No se pudo aplicar el orden: $e')),
        );
      }
    }
  }

  void _applySort(List<QueryDocumentSnapshot> docs) {
    String name(QueryDocumentSnapshot d) => SearchNormalizer.normalize(
        (d.data() as Map<String, dynamic>)['name']?.toString() ?? d.id);
    double price(QueryDocumentSnapshot d) =>
        ((d.data() as Map<String, dynamic>)['price'] as num?)?.toDouble() ?? 0;
    int stock(QueryDocumentSnapshot d) =>
        _totalStock(d.data() as Map<String, dynamic>);
    int priority(QueryDocumentSnapshot d) =>
        ((d.data() as Map<String, dynamic>)['priority'] as num?)?.toInt() ??
        9999;
    bool featured(QueryDocumentSnapshot d) =>
        (d.data() as Map<String, dynamic>)['featured'] == true;
    int byPriority(QueryDocumentSnapshot a, QueryDocumentSnapshot b) {
      final pa = priority(a);
      final pb = priority(b);
      if (pa != pb) return pa.compareTo(pb);
      return name(a).compareTo(name(b));
    }

    switch (sort) {
      case ProductSort.nameAsc:
        docs.sort((a, b) => name(a).compareTo(name(b)));
        break;
      case ProductSort.priceAsc:
        docs.sort((a, b) {
          final c = price(a).compareTo(price(b));
          return c != 0 ? c : byPriority(a, b);
        });
        break;
      case ProductSort.priceDesc:
        docs.sort((a, b) => price(b).compareTo(price(a)));
        break;
      case ProductSort.stockDesc:
        docs.sort((a, b) => stock(b).compareTo(stock(a)));
        break;
      case ProductSort.featuredFirst:
        docs.sort((a, b) {
          final fa = featured(a) ? 0 : 1;
          final fb = featured(b) ? 0 : 1;
          if (fa != fb) return fa.compareTo(fb);
          return byPriority(a, b);
        });
        break;
      case ProductSort.displayOrder:
        docs.sort(byPriority);
        break;
    }
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({required this.doc});

  final QueryDocumentSnapshot doc;

  @override
  Widget build(BuildContext context) {
    final data = doc.data() as Map<String, dynamic>;
    final stock = _totalStock(data);
    final available = _isAvailable(data, stock);
    final variants = (data['variants'] as List?) ?? const [];
    final images = (data['images'] as List?)?.cast<dynamic>() ?? const [];
    final image = images
        .whereType<String>()
        .firstWhere((u) => u.trim().isNotEmpty, orElse: () => '');
    final price = (data['price'] as num?)?.toDouble();
    final featured = data['featured'] == true;
    final brand = data['brand']?.toString() ?? '';

    return SoftTile(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ProductEditScreen(sku: doc.id, data: data),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SoftThumbnail(url: image, featured: featured),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        data['name']?.toString() ?? doc.id,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                            color: SoftTheme.text),
                      ),
                    ),
                    if (featured) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color:
                              const Color(0xFFFBBF24).withValues(alpha: 0.90),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.star, size: 11, color: Colors.black),
                            SizedBox(width: 3),
                            Text(
                              'Destacado',
                              style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.black),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
                if (brand.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    brand.toUpperCase(),
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                      color: SoftTheme.textMuted,
                    ),
                  ),
                ],
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    SoftBadge(
                      text: price != null ? _cop(price) : '-',
                      color: SoftTheme.cBlue,
                      size: 12,
                    ),
                    SoftBadge(
                      text: available ? '$stock disp.' : 'Agotado',
                      color: available ? SoftTheme.cEmerald : SoftTheme.cRose,
                      size: 11,
                    ),
                    if (variants.isNotEmpty)
                      SoftBadge(
                        text: '${variants.length} variantes',
                        color: SoftTheme.textMuted,
                        size: 11,
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  'Código: ${doc.id}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      const TextStyle(fontSize: 11, color: SoftTheme.textMuted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 4),
          const Icon(Icons.chevron_right, size: 20, color: SoftTheme.textMuted),
        ],
      ),
    );
  }
}
