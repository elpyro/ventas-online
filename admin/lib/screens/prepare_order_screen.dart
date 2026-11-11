import '../theme/soft_theme.dart';
import '../utils/money.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import '../widgets/order_status_badge.dart';
import 'product_edit_screen.dart';

/// Pantalla "Preparar Pedido": lista los productos del pedido con foto en
/// miniatura, detalle y valor. Cada línea tiene un check para marcarla como
/// preparada. El primer check pasa el pedido a Preparando; cuando todos
/// están marcados pasa a Listo (automático) — también se puede marcar Listo
/// a mano. Precio y cantidad se editan sobre el item del pedido y el total
/// se recalcula.
class PrepareOrderScreen extends StatefulWidget {
  const PrepareOrderScreen(
      {super.key, required this.orderId, required this.data});

  final String orderId;
  final Map<String, dynamic> data;

  @override
  State<PrepareOrderScreen> createState() => _PrepareOrderScreenState();
}

class _PrepareOrderScreenState extends State<PrepareOrderScreen> {
  static const CopFormat cop = CopFormat();

  late List<Map<String, dynamic>> items;
  late String status;
  bool saving = false;
  String? error;
  final Map<String, String?> thumbs = {};

  @override
  void initState() {
    super.initState();
    items = ((widget.data['items'] as List?) ?? const [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    status = widget.data['status']?.toString() ?? 'pending';
    _loadThumbs();
  }

  Future<void> _loadThumbs() async {
    for (final it in items) {
      final sku = it['sku']?.toString() ?? '';
      if (sku.isEmpty) continue;
      try {
        final snap = await FirebaseFirestore.instance
            .collection('products')
            .doc(sku)
            .get();
        final imgs = (snap.data()?['images'] as List?) ?? const [];
        if (mounted) {
          setState(() =>
              thumbs[sku] = imgs.isNotEmpty ? imgs.first.toString() : null);
        }
      } catch (_) {
        if (mounted) setState(() => thumbs[sku] = null);
      }
    }
  }

  double get total {
    return items.fold<double>(
      0,
      (s, it) =>
          s +
          (((it['quantity'] as num?)?.toInt() ?? 0) *
              ((it['unitPrice'] as num?)?.toDouble() ?? 0)),
    );
  }

  bool get allDone =>
      items.isNotEmpty && items.every((it) => it['prepared'] == true);

  int get doneCount => items.where((it) => it['prepared'] == true).length;

  Future<void> _save() async {
    setState(() {
      saving = true;
      error = null;
    });
    try {
      final newItems = items.map((it) {
        final qty = (it['quantity'] as num?)?.toInt() ?? 0;
        final unit = (it['unitPrice'] as num?)?.toDouble() ?? 0;
        final subtotal = double.parse((qty * unit).toStringAsFixed(2));
        return {
          ...it,
          'quantity': qty,
          'unitPrice': unit,
          'subtotal': subtotal,
        };
      }).toList();
      await FirebaseFirestore.instance
          .collection('orders')
          .doc(widget.orderId)
          .set({
        'items': newItems,
        'total': double.parse(total.toStringAsFixed(2)),
        'status': status,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      if (mounted) {
        widget.data['items'] = newItems;
        widget.data['total'] = double.parse(total.toStringAsFixed(2));
        widget.data['status'] = status;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Pedido actualizado')),
        );
      }
    } catch (e) {
      if (mounted) setState(() => error = 'No se pudo guardar: $e');
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _onTogglePrepared(int i, bool? v) async {
    setState(() {
      items[i]['prepared'] = v ?? false;
      // Automático: al seleccionar o deseleccionar, si hay al menos uno
      // marcado el pedido está Preparando.
      if (doneCount > 0 && (status == 'pending' || status == 'selecting')) {
        status = 'preparing';
      } else if (doneCount == 0 && status == 'preparing') {
        status = 'pending';
      } else if (doneCount > 0 && status == 'ready') {
        status = 'preparing';
      }
    });
    if (allDone && status != 'ready') {
      // Al marcar el último producto: pregunta si se pasa a Listo
      // (muestra los otros estados; al darle Sí cierra y vuelve atrás
      // con los datos actualizados).
      final choice = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('¿Pasar a Listo?'),
          content: const Text(
            'Todos los productos están marcados como preparados. ¿Deseas pasar el pedido a Listo?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, 'ready'),
              child: const Text('Sí, Listo'),
            ),
            for (final s in ['preparing', 'dispatched', 'cancelled', 'pending'])
              TextButton(
                onPressed: () => Navigator.pop(ctx, s),
                child: Text(OrderStatusBadge.label(s)),
              ),
          ],
        ),
      );
      if (choice != null && mounted) {
        setState(() => status = choice);
        await _save();
        if (mounted) Navigator.of(context).pop(); // vuelve a la anterior
      }
    }
  }

  Future<void> _openLargeImage(String? url) async {
    if (url == null || url.isEmpty) return;
    await showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(16),
        child: GestureDetector(
          onTap: () => Navigator.pop(context),
          child: InteractiveViewer(
            // Imagen grande ampliable: se deja resolución completa para
            // que el zoom no se pixele (sin memCacheWidth/maxWidthDiskCache).
            child: CachedNetworkImage(imageUrl: url, fit: BoxFit.contain),
          ),
        ),
      ),
    );
  }

  Future<void> _deleteLine(int i) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Eliminar producto'),
        content: const Text(
            'Se quitará este producto del pedido y el total se recalculará.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => items.removeAt(i));
  }

  Future<void> _editLine(int i) async {
    final it = items[i];
    final qtyCtrl = TextEditingController(
        text: '${(it['quantity'] as num?)?.toInt() ?? 0}');
    final priceCtrl = TextEditingController(
        text:
            '${((it['unitPrice'] as num?)?.toDouble() ?? 0).toStringAsFixed(2)}');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Editar ${(it['name'] ?? it['sku']).toString()}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: qtyCtrl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Cantidad'),
            ),
            TextField(
              controller: priceCtrl,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration:
                  const InputDecoration(labelText: 'Precio unitario (COP)'),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancelar')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Aceptar'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final qty = int.tryParse(qtyCtrl.text.trim());
    final price = double.tryParse(priceCtrl.text.trim().replaceAll(',', '.'));
    if (qty == null || qty < 1 || price == null || price < 0) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Cantidad y precio deben ser válidos')),
        );
      }
      return;
    }
    setState(() {
      items[i]['quantity'] = qty;
      items[i]['unitPrice'] = price;
      // Al editar la línea, se deschequea para que se vuelva a revisar.
      items[i]['prepared'] = false;
      // Si estaba en Listo/Preparando, vuelve a Preparando (o Pendiente si nada queda marcado).
      if (status == 'ready') {
        status = 'preparing';
      }
      if (doneCount == 0 && status == 'preparing') {
        status = 'pending';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = ShadTheme.of(context);
    return Scaffold(
      backgroundColor: SoftTheme.background,
      appBar: AppBar(title: const Text('Preparar Pedido')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                OrderStatusBadge(status),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('$doneCount de ${items.length} productos listos',
                      style: theme.textTheme.small),
                ),
                Text(cop.format(total),
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 16)),
              ],
            ),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: ShadAlert.destructive(
                icon: const Icon(Icons.error_outline),
                title: const Text('Error'),
                description: Text(error!),
              ),
            ),
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final it = items[i];
                final sku = it['sku']?.toString() ?? '';
                final thumb = thumbs[sku];
                final qty = (it['quantity'] as num?)?.toInt() ?? 0;
                final unit = (it['unitPrice'] as num?)?.toDouble() ?? 0;
                final prepared = it['prepared'] == true;
                return ShadCard(
                  width: double.infinity,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        GestureDetector(
                          onTap: () => _openLargeImage(thumb),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: SizedBox(
                              width: 56,
                              height: 56,
                              child: thumb == null
                                  ? Container(
                                      color: theme.colorScheme.accent,
                                      child: const Icon(Icons.image_outlined),
                                    )
                                  : CachedNetworkImage(
                                      imageUrl: thumb,
                                      fit: BoxFit.cover,
                                      // Miniatura 56×56: versión reducida en
                                      // memoria y disco.
                                      memCacheWidth: 112,
                                      maxWidthDiskCache: 112,
                                      errorWidget: (_, __, ___) => Container(
                                            color: theme.colorScheme.accent,
                                            child: const Icon(
                                                Icons.image_outlined),
                                          )),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                (it['name'] ?? sku).toString(),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700),
                              ),
                              Text('$qty × ${cop.format(unit)}',
                                  style: theme.textTheme.small),
                              Text('Subtotal ${cop.format(qty * unit)}',
                                  style: theme.textTheme.muted),
                              if (it['variantLabel'] != null)
                                Text(it['variantLabel'].toString(),
                                    style: theme.textTheme.small),
                              if (it['note'] != null &&
                                  (it['note'].toString().trim().isNotEmpty))
                                Text('Nota: ${it['note']}',
                                    style: theme.textTheme.small),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.delete_outline,
                                        color: Colors.red),
                                    tooltip: 'Eliminar producto',
                                    onPressed: () => _deleteLine(i),
                                  ),
                                  TextButton.icon(
                                    onPressed: () => _editLine(i),
                                    icon: const Icon(Icons.edit, size: 16),
                                    label: const Text('Editar'),
                                  ),
                                  TextButton.icon(
                                    onPressed: () => _openProduct(sku),
                                    icon:
                                        const Icon(Icons.open_in_new, size: 16),
                                    label: const Text('Producto'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 4),
                        Checkbox(
                          value: prepared,
                          onChanged: (v) => _onTogglePrepared(i, v),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButton<String>(
                          value: [
                            'pending',
                            'preparing',
                            'ready',
                            'dispatched',
                            'cancelled'
                          ].contains(status)
                              ? status
                              : 'pending',
                          hint: const Text('Estado manual'),
                          items: [
                            'pending',
                            'preparing',
                            'ready',
                            'dispatched',
                            'cancelled'
                          ]
                              .map((s) => DropdownMenuItem(
                                  value: s,
                                  child: Text(OrderStatusBadge.label(s))))
                              .toList(),
                          onChanged: (v) {
                            if (v != null) setState(() => status = v);
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      SoftTheme.fabButton(
                        label: saving ? 'Guardando…' : 'Guardar cambios',
                        onPressed: saving ? null : _save,
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Al marcar el primer producto el pedido pasa a Preparando; al marcar el último, a Listo (descuenta stock).',
                    style: TextStyle(fontSize: 11),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openProduct(String sku) async {
    if (sku.isEmpty) return;
    final snap =
        await FirebaseFirestore.instance.collection('products').doc(sku).get();
    if (!mounted) return;
    final data = snap.exists
        ? (snap.data() ?? <String, dynamic>{})
        : <String, dynamic>{};
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ProductEditScreen(sku: sku, data: data),
      ),
    );
  }
}
