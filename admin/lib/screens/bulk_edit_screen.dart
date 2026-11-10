import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../theme/soft_theme.dart';

/// Producto elegido para edición masiva: SKU + datos actuales. Los datos se
/// usan solo para calcular campos derivados (p. ej. el listado final de
/// catálogos o el merge de etiquetas) sin pisar el resto del documento.
class BulkEditProduct {
  const BulkEditProduct({
    required this.sku,
    required this.name,
    required this.data,
  });

  final String sku;
  final String name;
  final Map<String, dynamic> data;
}

/// Campos con tres estados: sin cambiar / sí / no.
enum _TriState { unchanged, yes, no }

String _triStateLabel(_TriState v) => switch (v) {
      _TriState.unchanged => 'Sin cambiar',
      _TriState.yes => 'Sí',
      _TriState.no => 'No',
    };

/// Edición masiva de varios productos a la vez.
///
/// Regla de oro: los campos que el usuario deja vacíos o en "Sin cambiar"
/// NO se escriben en Firestore, así el resto del producto queda igual.
/// Las escrituras van en lotes (WriteBatch, máx. 400 por lote).
class BulkEditScreen extends StatefulWidget {
  const BulkEditScreen({super.key, required this.products});

  final List<BulkEditProduct> products;

  @override
  State<BulkEditScreen> createState() => _BulkEditScreenState();
}

/// Fila de especificación para la edición masiva.
class _BulkSpecRow {
  _BulkSpecRow({String label = '', String value = ''})
      : labelCtrl = TextEditingController(text: label),
        valueCtrl = TextEditingController(text: value);

  final TextEditingController labelCtrl;
  final TextEditingController valueCtrl;

  void dispose() {
    labelCtrl.dispose();
    valueCtrl.dispose();
  }
}

/// Valores ya validados del formulario. null / vacío = "no tocar".
class _BulkInput {
  const _BulkInput({
    required this.price,
    required this.stock,
    required this.priority,
    required this.brand,
    required this.available,
    required this.featured,
    required this.tags,
    required this.replaceTags,
    required this.seoTitle,
    required this.seoDescription,
    required this.specs,
    required this.catalogsToAdd,
    required this.catalogsToRemove,
  });

  final double? price;
  final int? stock;
  final int? priority;
  final String brand;
  final _TriState available;
  final _TriState featured;

  /// Etiquetas parseadas; null = no tocar. [replaceTags] decide si se
  /// reemplazan las actuales o se agregan sin duplicar.
  final List<String>? tags;
  final bool replaceTags;
  final String seoTitle;
  final String seoDescription;

  /// Especificaciones nuevas; se fusionan por nombre de campo con las
  /// existentes de cada producto. null = no tocar.
  final List<Map<String, dynamic>>? specs;
  final Set<String> catalogsToAdd;
  final Set<String> catalogsToRemove;

  bool get touchesCatalogs =>
      catalogsToAdd.isNotEmpty || catalogsToRemove.isNotEmpty;
  bool get touchesState =>
      available != _TriState.unchanged || featured != _TriState.unchanged;
  bool get touchesNothing =>
      price == null &&
      stock == null &&
      priority == null &&
      brand.isEmpty &&
      !touchesState &&
      !touchesCatalogs &&
      tags == null &&
      seoTitle.isEmpty &&
      seoDescription.isEmpty &&
      (specs == null || specs!.isEmpty);
}

class _BulkEditScreenState extends State<BulkEditScreen> {
  final priceCtrl = TextEditingController();
  final stockCtrl = TextEditingController();
  final brandCtrl = TextEditingController();
  final priorityCtrl = TextEditingController();
  final tagsCtrl = TextEditingController();
  final seoTitleCtrl = TextEditingController();
  final seoDescriptionCtrl = TextEditingController();

  final List<_BulkSpecRow> specRows = [];

  _TriState available = _TriState.unchanged;
  _TriState featured = _TriState.unchanged;

  /// Catálogos a agregar/quitar para TODOS los seleccionados.
  final Set<String> catalogsToAdd = {};
  final Set<String> catalogsToRemove = {};

  /// false = las etiquetas se agregan a las existentes; true = se reemplazan.
  bool replaceTags = false;

  bool saving = false;
  String? error;

  @override
  void dispose() {
    priceCtrl.dispose();
    stockCtrl.dispose();
    brandCtrl.dispose();
    priorityCtrl.dispose();
    tagsCtrl.dispose();
    seoTitleCtrl.dispose();
    seoDescriptionCtrl.dispose();
    for (final row in specRows) {
      row.dispose();
    }
    super.dispose();
  }

  void _showError(String message) {
    if (!mounted) return;
    setState(() {
      error = message;
      saving = false;
    });
    SoftTheme.showSnack(context, message, type: SnackType.error);
  }

  // ------------------------------------------------------------------
  // Validación y guardado
  // ------------------------------------------------------------------
  Future<void> _save() async {
    double? price;
    int? stock;
    int? priority;

    final priceText = priceCtrl.text.trim();
    if (priceText.isNotEmpty) {
      price = double.tryParse(priceText.replaceAll(',', '.'));
      if (price == null || price < 0) {
        _showError('Ingresa un precio válido (mayor o igual a 0).');
        return;
      }
    }
    final stockText = stockCtrl.text.trim();
    if (stockText.isNotEmpty) {
      stock = int.tryParse(stockText);
      if (stock == null || stock < 0) {
        _showError('Ingresa un stock válido (entero mayor o igual a 0).');
        return;
      }
    }
    final priorityText = priorityCtrl.text.trim();
    if (priorityText.isNotEmpty) {
      priority = int.tryParse(priorityText);
      if (priority == null || priority < 0) {
        _showError('Ingresa un orden válido (entero mayor o igual a 0).');
        return;
      }
    }

    // Etiquetas: texto escrito pero sin nada útil = error del usuario.
    List<String>? tags;
    final tagsText = tagsCtrl.text.trim();
    if (tagsText.isNotEmpty) {
      tags = tagsText
          .split(',')
          .map((t) => t.trim())
          .where((t) => t.isNotEmpty)
          .toSet()
          .toList();
      if (tags.isEmpty) {
        _showError('Ingresa etiquetas válidas (texto separado por comas).');
        return;
      }
    }

    // Especificaciones: fila a medias = error; fila vacía se ignora.
    List<Map<String, dynamic>>? specs;
    if (specRows.any((r) =>
        r.labelCtrl.text.trim().isNotEmpty ||
        r.valueCtrl.text.trim().isNotEmpty)) {
      specs = [];
      for (var i = 0; i < specRows.length; i++) {
        final label = specRows[i].labelCtrl.text.trim();
        final value = specRows[i].valueCtrl.text.trim();
        if (label.isEmpty && value.isEmpty) continue;
        if (label.isEmpty || value.isEmpty) {
          _showError(
              'La especificación ${i + 1} necesita el campo y el valor.');
          return;
        }
        specs.add({'label': label, 'value': value});
      }
    }

    final input = _BulkInput(
      price: price,
      stock: stock,
      priority: priority,
      brand: brandCtrl.text.trim(),
      available: available,
      featured: featured,
      tags: tags,
      replaceTags: replaceTags,
      seoTitle: seoTitleCtrl.text.trim(),
      seoDescription: seoDescriptionCtrl.text.trim(),
      specs: specs,
      catalogsToAdd: catalogsToAdd,
      catalogsToRemove: catalogsToRemove,
    );

    if (input.touchesNothing) {
      _showError('Cambia al menos un campo para editar los productos.');
      return;
    }

    final plan = _buildUpdates(input);

    if (plan.updatesBySku.isEmpty) {
      _showError(
          'Con estos cambios ningún producto se puede actualizar. Revisa las advertencias.');
      return;
    }

    final confirmed = await _confirmDialog(plan);
    if (confirmed != true || !mounted) return;

    setState(() {
      saving = true;
      error = null;
    });
    try {
      await _commit(plan.updatesBySku);
      if (!mounted) return;
      SoftTheme.showSnack(
        context,
        'Se actualizaron ${plan.updatesBySku.length} de '
        '${widget.products.length} productos',
        type: SnackType.success,
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      _showError(
          'No se pudo guardar la edición masiva. Revisa tu conexión e inténtalo otra vez.\n\nDetalle: $e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  /// Cambios que se aplicarán a cada producto. Campos vacíos o "Sin cambiar"
  /// simplemente no entran en el mapa: Firestore solo recibe lo editado.
  _BulkPlan _buildUpdates(_BulkInput input) {
    final updatesBySku = <String, Map<String, dynamic>>{};
    var skippedByVariants = 0;
    var skippedByCatalogs = 0;

    for (final p in widget.products) {
      final updates = <String, dynamic>{};
      if (input.price != null) updates['price'] = input.price;

      // El stock de un producto con variantes se recalcula desde ellas:
      // pisarlo aquí sería mentirle al inventario. Se omite y se avisa.
      if (input.stock != null) {
        final variants = (p.data['variants'] as List?) ?? const [];
        if (variants.isNotEmpty) {
          skippedByVariants++;
        } else {
          updates['stock'] = input.stock;
        }
      }

      if (input.priority != null) updates['priority'] = input.priority;
      if (input.brand.isNotEmpty) updates['brand'] = input.brand;
      if (input.available != _TriState.unchanged) {
        updates['isAvailable'] = input.available == _TriState.yes;
      }
      if (input.featured != _TriState.unchanged) {
        updates['featured'] = input.featured == _TriState.yes;
      }

      if (input.tags != null) {
        if (input.replaceTags) {
          updates['tags'] = input.tags;
        } else {
          final current =
              (p.data['tags'] as List?)?.map((e) => e.toString()).toSet() ??
                  <String>{};
          updates['tags'] = [...current, ...input.tags!];
        }
      }
      if (input.seoTitle.isNotEmpty) updates['seoTitle'] = input.seoTitle;
      if (input.seoDescription.isNotEmpty) {
        updates['seoDescription'] = input.seoDescription;
      }

      if (input.specs != null && input.specs!.isNotEmpty) {
        // Merge por nombre de campo: si el producto ya tiene ese campo se
        // actualiza su valor; si no, se añade al final. Nunca se borran las
        // especificaciones existentes.
        final current = (p.data['specs'] as List?) ?? const [];
        final merged = <Map<String, dynamic>>[
          for (final raw in current)
            if (raw is Map)
              {
                'label': raw['label']?.toString() ?? '',
                'value': raw['value']?.toString() ?? '',
              },
        ];
        for (final s in input.specs!) {
          final idx = merged.indexWhere((m) => m['label'] == s['label']);
          if (idx >= 0) {
            merged[idx] = s;
          } else {
            merged.add(s);
          }
        }
        updates['specs'] = merged;
      }

      if (input.touchesCatalogs) {
        final current = (p.data['catalogIds'] as List?)
                ?.map((e) => e.toString())
                .toList() ??
            const <String>[];
        final merged = {...current, ...input.catalogsToAdd}
          ..removeAll(input.catalogsToRemove);
        // Un producto sin catálogos no se muestra en la web: si estos cambios
        // lo dejarían vacío, se omite entero y se reporta.
        if (merged.isEmpty) {
          skippedByCatalogs++;
          continue;
        }
        updates['catalogIds'] = merged.toList()..sort();
      }

      if (updates.isNotEmpty) {
        updates['updatedAt'] = FieldValue.serverTimestamp();
        updatesBySku[p.sku] = updates;
      }
    }

    return _BulkPlan(
      updatesBySku: updatesBySku,
      skippedByVariants: skippedByVariants,
      skippedByCatalogs: skippedByCatalogs,
      fields: [
        if (input.price != null) 'precio',
        if (input.stock != null) 'stock',
        if (input.priority != null) 'orden visible',
        if (input.brand.isNotEmpty) 'marca',
        if (input.available != _TriState.unchanged) 'disponible',
        if (input.featured != _TriState.unchanged) 'destacado',
        if (input.touchesCatalogs) 'catálogos',
        if (input.tags != null)
          input.replaceTags ? 'etiquetas (reemplazar)' : 'etiquetas (agregar)',
        if (input.seoTitle.isNotEmpty) 'título SEO',
        if (input.seoDescription.isNotEmpty) 'descripción SEO',
        if (input.specs != null && input.specs!.isNotEmpty)
          'especificaciones (${input.specs!.length})',
      ],
    );
  }

  Future<bool?> _confirmDialog(_BulkPlan plan) {
    final notes = <String>[
      if (plan.skippedByVariants > 0)
        '${plan.skippedByVariants} producto(s) tienen variantes y conservan su stock (se calcula por variante).',
      if (plan.skippedByCatalogs > 0)
        '${plan.skippedByCatalogs} producto(s) quedarían sin catálogo y no se cambian.',
    ];
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirmar edición masiva'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
                'Se actualizarán ${plan.updatesBySku.length} de ${widget.products.length} productos.'),
            const SizedBox(height: 8),
            Text('Campos: ${plan.fields.join(', ')}.'),
            for (final n in notes) ...[
              const SizedBox(height: 8),
              Text(n,
                  style: const TextStyle(
                      fontSize: 12, color: SoftTheme.textMuted)),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Actualizar'),
          ),
        ],
      ),
    );
  }

  /// Escribe los cambios en lotes de 400 (Firestore permite 500 escrituras
  /// por WriteBatch; se deja margen).
  Future<void> _commit(Map<String, Map<String, dynamic>> updatesBySku) async {
    final products = FirebaseFirestore.instance.collection('products');
    final entries = updatesBySku.entries.toList();
    for (var i = 0; i < entries.length; i += 400) {
      final batch = FirebaseFirestore.instance.batch();
      for (final e in entries.skip(i).take(400)) {
        batch.update(products.doc(e.key), e.value);
      }
      await batch.commit();
    }
  }

  // ------------------------------------------------------------------
  // UI
  // ------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SoftTheme.background,
      appBar: AppBar(title: Text('Editar ${widget.products.length} productos')),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              children: [
                if (error != null) ...[
                  _ErrorBox(message: error!),
                  const SizedBox(height: 16),
                ],
                _SummaryCard(products: widget.products),
                const SizedBox(height: 28),
                const _SectionTitle('Precio y stock'),
                TextField(
                  controller: priceCtrl,
                  enabled: !saving,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Precio COP',
                    helperText: 'Vacío = no cambiar',
                  ),
                ),
                TextField(
                  controller: stockCtrl,
                  enabled: !saving,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Stock',
                    helperText:
                        'Vacío = no cambiar. Los productos con variantes conservan su stock',
                  ),
                ),
                const SizedBox(height: 28),
                const _SectionTitle('Estado'),
                _TriStateField(
                  label: 'Disponible para la venta',
                  value: available,
                  onChanged:
                      saving ? null : (v) => setState(() => available = v),
                ),
                const SizedBox(height: 12),
                _TriStateField(
                  label: 'Destacado (oferta en la home)',
                  value: featured,
                  onChanged:
                      saving ? null : (v) => setState(() => featured = v),
                ),
                const SizedBox(height: 28),
                const _SectionTitle('Marca y orden'),
                TextField(
                  controller: brandCtrl,
                  enabled: !saving,
                  decoration: const InputDecoration(
                    labelText: 'Marca',
                    helperText: 'Vacío = no cambiar',
                  ),
                ),
                TextField(
                  controller: priorityCtrl,
                  enabled: !saving,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Orden visible',
                    helperText: 'Menor = aparece primero en la web',
                  ),
                ),
                const SizedBox(height: 28),
                const _SectionTitle('Catálogos'),
                const Text(
                  'Se aplica a todos los productos seleccionados. Sin marcar = no cambiar.',
                  style: TextStyle(fontSize: 12),
                ),
                const SizedBox(height: 8),
                _CatalogPickers(
                  toAdd: catalogsToAdd,
                  toRemove: catalogsToRemove,
                  enabled: !saving,
                  onChanged: () => setState(() {}),
                ),
                const SizedBox(height: 28),
                const _SectionTitle('Búsqueda y SEO'),
                TextField(
                  controller: tagsCtrl,
                  enabled: !saving,
                  decoration: const InputDecoration(
                    labelText: 'Etiquetas',
                    helperText:
                        'Separadas por coma. Vacío = no cambiar. Ej: audífonos, bluetooth',
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    ChoiceChip(
                      label: const Text('Agregar a las existentes'),
                      selected: !replaceTags,
                      onSelected: saving
                          ? null
                          : (_) => setState(() => replaceTags = false),
                    ),
                    const SizedBox(width: 6),
                    ChoiceChip(
                      label: const Text('Reemplazar todas'),
                      selected: replaceTags,
                      onSelected: saving
                          ? null
                          : (_) => setState(() => replaceTags = true),
                    ),
                  ],
                ),
                TextField(
                  controller: seoTitleCtrl,
                  enabled: !saving,
                  decoration: const InputDecoration(
                    labelText: 'Título SEO',
                    helperText: 'Vacío = no cambiar',
                  ),
                ),
                TextField(
                  controller: seoDescriptionCtrl,
                  enabled: !saving,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Descripción SEO',
                    helperText: 'Vacío = no cambiar',
                  ),
                ),
                const SizedBox(height: 28),
                const _SectionTitle('Especificaciones (para todos)'),
                const Text(
                  'Se añaden o actualizan por nombre de campo en cada producto; las que ya existen no se borran.',
                  style: TextStyle(fontSize: 12),
                ),
                const SizedBox(height: 8),
                for (var i = 0; i < specRows.length; i++)
                  _SpecCard(
                    row: specRows[i],
                    enabled: !saving,
                    onDelete: () =>
                        setState(() => specRows.removeAt(i).dispose()),
                  ),
                OutlinedButton.icon(
                  onPressed: saving
                      ? null
                      : () => setState(() => specRows.add(_BulkSpecRow())),
                  icon: const Icon(Icons.add),
                  label: const Text('Agregar especificación'),
                ),
                const SizedBox(height: 28),
                const Text(
                  'Los campos que dejes vacíos o en "Sin cambiar" se quedan como están.',
                  style: TextStyle(fontSize: 12, color: SoftTheme.textMuted),
                ),
              ],
            ),
          ),
          _buildFooterActions(),
        ],
      ),
    );
  }

  Widget _buildFooterActions() {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: SoftTheme.fabButton(
          label: saving ? 'Guardando…' : 'Guardar cambios',
          icon: Icons.save,
          onPressed: saving ? null : _save,
        ),
      ),
    );
  }
}

/// Resultado de validar el formulario: qué se escribirá por producto y qué
/// se omite (para avisar antes de guardar).
class _BulkPlan {
  const _BulkPlan({
    required this.updatesBySku,
    required this.skippedByVariants,
    required this.skippedByCatalogs,
    required this.fields,
  });

  final Map<String, Map<String, dynamic>> updatesBySku;
  final int skippedByVariants;
  final int skippedByCatalogs;

  /// Nombres legibles de los campos que se van a tocar (para confirmar).
  final List<String> fields;
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
      ),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.red.shade50,
        border: Border.all(color: Colors.red.shade200),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(message, style: TextStyle(color: Colors.red.shade800)),
    );
  }
}

/// Muestra qué productos se van a editar (primeros nombres + "+N más").
class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.products});

  final List<BulkEditProduct> products;

  @override
  Widget build(BuildContext context) {
    final shown = products.take(8).map((p) => p.name).toList();
    final rest = products.length - shown.length;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: SoftTheme.cardDecoration(radius: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${products.length} producto(s) seleccionados',
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              for (final name in shown)
                SoftBadge(text: name, color: SoftTheme.cViolet, size: 11),
              if (rest > 0)
                SoftBadge(
                    text: '+$rest más', color: SoftTheme.textMuted, size: 11),
            ],
          ),
        ],
      ),
    );
  }
}

/// Fila de tres opciones (Sin cambiar / Sí / No) con el estilo de chips del
/// resto de la app.
class _TriStateField extends StatelessWidget {
  const _TriStateField({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final _TriState value;
  final ValueChanged<_TriState>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Wrap(
          spacing: 6,
          children: [
            for (final v in _TriState.values)
              ChoiceChip(
                label: Text(_triStateLabel(v)),
                selected: value == v,
                onSelected: onChanged == null ? null : (_) => onChanged!(v),
              ),
          ],
        ),
      ],
    );
  }
}

/// Chips de catálogos para agregar y quitar en lote.
class _CatalogPickers extends StatelessWidget {
  const _CatalogPickers({
    required this.toAdd,
    required this.toRemove,
    required this.enabled,
    required this.onChanged,
  });

  final Set<String> toAdd;
  final Set<String> toRemove;
  final bool enabled;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance.collection('catalogs').snapshots(),
      builder: (context, snap) {
        if (snap.hasError) {
          return const Text('No se pudieron cargar los catálogos.');
        }
        if (!snap.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final docs = snap.data!.docs;
        if (docs.isEmpty) {
          return const Text('Aún no hay catálogos.');
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Agregar a',
                style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                for (final doc in docs)
                  FilterChip(
                    label: Text(_catalogTitle(doc)),
                    selected: toAdd.contains(doc.id),
                    onSelected: enabled
                        ? (sel) {
                            if (sel) {
                              toAdd.add(doc.id);
                              toRemove.remove(doc.id);
                            } else {
                              toAdd.remove(doc.id);
                            }
                            onChanged();
                          }
                        : null,
                  ),
              ],
            ),
            const SizedBox(height: 12),
            const Text('Quitar de',
                style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                for (final doc in docs)
                  FilterChip(
                    label: Text(_catalogTitle(doc)),
                    selected: toRemove.contains(doc.id),
                    onSelected: enabled
                        ? (sel) {
                            if (sel) {
                              toRemove.add(doc.id);
                              toAdd.remove(doc.id);
                            } else {
                              toRemove.remove(doc.id);
                            }
                            onChanged();
                          }
                        : null,
                  ),
              ],
            ),
          ],
        );
      },
    );
  }

  String _catalogTitle(QueryDocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return data['title']?.toString() ?? doc.id;
  }
}

/// Tarjeta de una especificación de la edición masiva.
class _SpecCard extends StatelessWidget {
  const _SpecCard({
    required this.row,
    required this.enabled,
    required this.onDelete,
  });

  final _BulkSpecRow row;
  final bool enabled;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Row(
          children: [
            Expanded(
              flex: 2,
              child: TextField(
                controller: row.labelCtrl,
                enabled: enabled,
                decoration: const InputDecoration(labelText: 'Campo'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 3,
              child: TextField(
                controller: row.valueCtrl,
                enabled: enabled,
                decoration: const InputDecoration(labelText: 'Valor'),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.close, size: 18),
              tooltip: 'Quitar',
              onPressed: enabled ? onDelete : null,
            ),
          ],
        ),
      ),
    );
  }
}
