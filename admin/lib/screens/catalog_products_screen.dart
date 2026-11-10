import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../theme/soft_theme.dart';
import '../widgets/product_list.dart';
import 'catalog_edit_screen.dart';
import 'product_edit_screen.dart';

/// Muestra los productos de un catálogo concreto, con la misma experiencia
/// que la pestaña Productos (búsqueda sin tildes, filtro y orden).
/// Incluye un botón flotante para crear un nuevo producto dentro de este
/// catálogo y, en la AppBar, el acceso para editar el catálogo mismo.
class CatalogProductsScreen extends StatelessWidget {
  const CatalogProductsScreen({
    super.key,
    required this.catalogId,
    required this.catalogTitle,
  });

  final String catalogId;
  final String catalogTitle;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SoftTheme.background,
      appBar: AppBar(
        title: Text(catalogTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune),
            tooltip: 'Editar catálogo',
            onPressed: () async {
              final doc = await FirebaseFirestore.instance
                  .collection('catalogs')
                  .doc(catalogId)
                  .get();
              if (!context.mounted) return;
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => CatalogEditScreen(
                    id: catalogId,
                    data: doc.data(),
                  ),
                ),
              );
            },
          ),
        ],
      ),
      floatingActionButton: _NewProductFab(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ProductEditScreen(
              initialCatalogId: catalogId,
            ),
          ),
        ),
      ),
      body: ProductList(catalogId: catalogId),
    );
  }
}

/// Botón flotante "Nuevo producto" con el formato "3D suave": pastilla con
/// degradado, borde claro y sombra azul.
class _NewProductFab extends StatelessWidget {
  const _NewProductFab({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(999);
    return Container(
      decoration: BoxDecoration(
        borderRadius: radius,
        boxShadow: [
          BoxShadow(
            color: SoftTheme.cBlue.withValues(alpha: 0.32),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
          BoxShadow(
            color: Colors.white.withValues(alpha: 0.85),
            blurRadius: 4,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: radius,
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xFF3B82F6), SoftTheme.cBlue],
            ),
            border: Border.all(color: Colors.white.withValues(alpha: 0.55)),
          ),
          child: InkWell(
            onTap: onTap,
            borderRadius: radius,
            child: Container(
              height: 52,
              padding: const EdgeInsets.symmetric(horizontal: 22),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.add, color: Colors.white, size: 22),
                  SizedBox(width: 8),
                  Text(
                    'Nuevo producto',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
