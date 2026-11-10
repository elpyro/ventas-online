import '../theme/soft_theme.dart';
import '../utils/money.dart';
import 'dart:convert';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shadcn_ui/shadcn_ui.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:firebase_core/firebase_core.dart' show Firebase, FirebaseApp;
import '../widgets/order_status_badge.dart';
import 'customer_detail_screen.dart';
import 'prepare_order_screen.dart';

class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen(
      {super.key, required this.orderId, required this.data});

  final String orderId;
  final Map<String, dynamic> data;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  static final DateFormat dateFormat = DateFormat('dd/MM/yyyy HH:mm');
  static const CopFormat cop = CopFormat();

  late String status;
  bool saving = false;
  String? error;
  bool sharingPdf = false;

  @override
  void initState() {
    super.initState();
    status = widget.data['status']?.toString() ?? 'pending';
  }

  String get originalStatus => widget.data['status']?.toString() ?? 'pending';

  String get date {
    final ts = widget.data['createdAt'] as Timestamp?;
    return ts == null ? '-' : dateFormat.format(ts.toDate());
  }

  bool get canPrepare => true;

  static FirebaseApp? get firebaseApp {
    try {
      return Firebase.app();
    } catch (_) {
      return null;
    }
  }

  static String get projectId => firebaseApp?.options.projectId ?? '';

  Future<void> _saveStatus() async {
    final newStatus = status;
    if (newStatus == originalStatus) return;

    if (newStatus == 'cancelled') {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Cancelar pedido'),
          content: const Text(
            'El pedido quedará Cancelado. Si ya había entrado a Listo, el stock se repone automáticamente.',
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Volver')),
            ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Cancelar pedido'),
            ),
          ],
        ),
      );
      if (ok != true) {
        setState(() => status = originalStatus);
        return;
      }
    }

    setState(() {
      saving = true;
      error = null;
    });
    try {
      await FirebaseFirestore.instance
          .collection('orders')
          .doc(widget.orderId)
          .update({
        'status': newStatus,
        'updatedAt': FieldValue.serverTimestamp(),
      });
      if (mounted) {
        widget.data['status'] = newStatus;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Pedido actualizado')),
        );
        setState(() => saving = false);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = 'No se pudo guardar el estado: $e';
          saving = false;
        });
      }
    }
  }

  /// Pide la URL firmada del PDF (callable getOrderPdfUrl vía REST con el
  /// ID token de sesión) y lo comparte como archivo con share_plus.
  Future<void> _sharePdf() async {
    setState(() => sharingPdf = true);
    try {
      // Requiere sesión: sin esto getOrderPdfUrl devuelve 401.
      await FirebaseAuth.instance.currentUser?.getIdToken(true);
      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      final url = Uri.parse(
          'https://us-central1-$projectId.cloudfunctions.net/getOrderPdfUrl');
      final res = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          if (token != null) 'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'data': {'orderId': widget.orderId}
        }),
      );
      if (res.statusCode != 200) {
        throw Exception(
            'No se pudo obtener el PDF (${res.statusCode}): ${res.body}');
      }
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final pdfUrl =
          (data['result'] as Map<String, dynamic>?)?['url']?.toString() ??
              (data['url']?.toString() ?? '');
      if (pdfUrl.isEmpty) throw Exception('PDF no disponible todavía.');
      final pdfRes = await http.get(Uri.parse(pdfUrl));
      if (pdfRes.statusCode != 200) {
        throw Exception('No se pudo descargar el PDF.');
      }
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/pedido-${widget.orderId}.pdf');
      await file.writeAsBytes(pdfRes.bodyBytes);
      final phone = (widget.data['customerPhone'] ?? '').toString();
      final total = (widget.data['total'] as num?)?.toDouble() ?? 0;
      final text =
          'Hola ${(widget.data['customerName'] ?? '').toString().trim()}, te envío tu pedido #${widget.orderId} de ${cop.format(total)}. Estado: ${OrderStatusBadge.label(status)}. Adjunto el PDF.';
      // Si WhatsApp está instalado, abrirlo directo con el PDF adjunto.
      const channel = MethodChannel('ventas/share_whatsapp');
      bool sentToWhatsApp = false;
      try {
        sentToWhatsApp = await channel.invokeMethod<bool>('shareToWhatsApp', {
              'filePath': file.path,
              'phone': phone,
              'text': text,
            }) ??
            false;
      } catch (_) {
        sentToWhatsApp = false;
      }
      if (!sentToWhatsApp) {
        // Sin WhatsApp: compartir a cualquier app (correo, Drive, etc.).
        await SharePlus.instance.share(ShareParams(
          files: [XFile(file.path, mimeType: 'application/pdf')],
          text: text,
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('No se pudo compartir el PDF: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => sharingPdf = false);
    }
  }

  Future<void> _openWhatsApp() async {
    final phone = (widget.data['customerPhone'] ?? '').toString();
    final total = (widget.data['total'] as num?)?.toDouble() ?? 0;
    final text = Uri.encodeComponent(
        'Hola ${(widget.data['customerName'] ?? '').toString()}, te contacto por tu pedido #${widget.orderId} de ${cop.format(total)}. Estado: ${OrderStatusBadge.label(status)}.');
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    final uri = Uri.parse(digits.isNotEmpty
        ? 'https://wa.me/$digits?text=$text'
        : 'https://wa.me/?text=$text');
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo abrir WhatsApp.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = widget.data;
    final total = (data['total'] as num?)?.toDouble() ?? 0;

    final dropdownValues =
        <String>{originalStatus, ...OrderStatusBadge.all}.toList();

    return Scaffold(
      backgroundColor: SoftTheme.background,
      appBar: AppBar(
        title: Text(
          'Pedido #${widget.orderId}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 16),
        children: [
          _Section(
            title: 'Cliente',
            children: [
              _Field(
                  label: 'Nombre',
                  value: (data['customerName'] ?? '-').toString(),
                  copyable: true),
              _Field(
                  label: 'Teléfono',
                  value: (data['customerPhone'] ?? '-').toString(),
                  copyable: true),
              _Field(
                  label: 'Correo',
                  value: (data['customerEmail'] ?? '-').toString(),
                  copyable: true),
              _Field(
                  label: 'Dirección',
                  value: (data['deliveryAddress'] ?? '-').toString(),
                  copyable: true),
              const SizedBox(height: 8),
              SoftTheme.fabButton(
                label: 'Ver todos los pedidos de este cliente',
                icon: Icons.group,
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => CustomerDetailScreen(
                      name: (data['customerName'] ?? '').toString(),
                      phone: (data['customerPhone'] ?? '').toString(),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          // Solo el monto. El detalle línea por línea vive en "Preparar Pedido".
          _Section(
            title: 'Monto',
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Total',
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: SoftTheme.text)),
                  SoftBadge(
                    text: cop.format(total),
                    color: SoftTheme.cEmerald,
                    size: 18,
                    padding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              SoftTheme.fabButton(
                label: sharingPdf ? 'Generando PDF…' : 'Compartir PDF',
                icon: Icons.picture_as_pdf,
                onPressed: sharingPdf ? null : _sharePdf,
              ),
              const SizedBox(height: 8),
              SoftTheme.fabButton(
                label: 'Escribir WhatsApp',
                icon: Icons.chat,
                onPressed: _openWhatsApp,
              ),
              if (canPrepare) ...[
                const SizedBox(height: 8),
                SoftTheme.fabButton(
                  label: 'Preparar pedido',
                  icon: Icons.inventory_2,
                  onPressed: () async {
                    await Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => PrepareOrderScreen(
                            orderId: widget.orderId, data: data),
                      ),
                    );
                    // Refresca el estado: preparar puede cambiarlo sin volver a montar.
                    if (mounted) {
                      setState(() {
                        status = widget.data['status']?.toString() ?? status;
                      });
                    }
                  },
                ),
              ],
            ],
          ),
          const SizedBox(height: 4),
          _Section(
            title: 'Detalles',
            children: [
              _Field(label: 'Fecha', value: date),
              _Field(
                  label: 'Origen', value: (data['source'] ?? 'web').toString()),
              _Field(label: 'ID', value: widget.orderId, copyable: true),
            ],
          ),
          const SizedBox(height: 4),
          _Section(
            title: 'Estado',
            children: [
              Row(
                children: [
                  OrderStatusBadge(status),
                  const Spacer(),
                  DropdownButton<String>(
                    value: status,
                    items: dropdownValues
                        .map((s) => DropdownMenuItem(
                            value: s, child: Text(OrderStatusBadge.label(s))))
                        .toList(),
                    onChanged: (v) => setState(() => status = v ?? status),
                  ),
                ],
              ),
              if (error != null) ...[
                const SizedBox(height: 8),
                ShadAlert.destructive(
                  icon: const Icon(Icons.error_outline),
                  title: const Text('Error'),
                  description: Text(error!),
                ),
              ],
              const SizedBox(height: 12),
              SoftTheme.fabButton(
                label: saving ? 'Guardando…' : 'Guardar estado',
                icon: Icons.save,
                onPressed:
                    status == originalStatus || saving ? null : _saveStatus,
              ),
            ],
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 6),
      decoration: SoftTheme.tileDecoration(),
      padding: const EdgeInsets.all(1.2),
      child: Card(
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SoftTheme.radiusInner),
        ),
        clipBehavior: Clip.antiAlias,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: SoftTheme.text),
              ),
              const SizedBox(height: 8),
              ...children,
            ],
          ),
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field(
      {required this.label, required this.value, this.copyable = false});

  final String label;
  final String value;
  final bool copyable;

  Future<void> _copy(BuildContext context) async {
    final v = value.trim();
    if (v.isEmpty || v == '-') return;
    await Clipboard.setData(ClipboardData(text: v));
    if (!context.mounted) return;
    SoftTheme.showSnack(context, 'Copiado: $v', type: SnackType.success);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label.toUpperCase(),
                  style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                      color: SoftTheme.textMuted),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: SoftTheme.text),
                ),
              ],
            ),
          ),
          if (copyable) ...[
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () => _copy(context),
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: SoftTheme.badgeDecoration(SoftTheme.cBlue),
                child: const Icon(Icons.content_copy,
                    size: 18, color: SoftTheme.cBlue),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
