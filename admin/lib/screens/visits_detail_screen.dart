import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../theme/soft_theme.dart';
import 'customer_detail_screen.dart';

/// Detalle completo de visitas (master-detail del panel).
/// La tarjeta compacta del Panel solo muestra el resumen: esta pantalla
/// muestra clientes de hoy y el historial de días anteriores.
class VisitsDetailScreen extends StatelessWidget {
  const VisitsDetailScreen({super.key});

  CollectionReference<Map<String, dynamic>> get _historyRef =>
      FirebaseFirestore.instance
          .collection('metrics')
          .doc('visits')
          .collection('history');

  String _todayKey() =>
      DateTime.now().toUtc().toIso8601String().substring(0, 10);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SoftTheme.background,
      appBar: AppBar(title: const Text('Visitas de la tienda')),
      body: StreamBuilder<QuerySnapshot>(
        stream: _historyRef.limit(30).snapshots(),
        builder: (context, snap) {
          if (snap.hasError)
            return Center(
                child:
                    Text('No se pudieron cargar las visitas: ${snap.error}'));
          if (!snap.hasData)
            return const Center(child: CircularProgressIndicator());
          final docs = [...snap.data!.docs]
            ..sort((a, b) => b.id.compareTo(a.id));
          final todayKey = _todayKey();
          QueryDocumentSnapshot? todayDoc;
          for (final d in docs) {
            if (d.id == todayKey) {
              todayDoc = d;
              break;
            }
          }
          final todayData = todayDoc == null
              ? <String, dynamic>{}
              : todayDoc.data() as Map<String, dynamic>;
          final anonymous = (todayData['anonymous'] as num?)?.toInt() ?? 0;
          final registered = (todayData['registered'] as num?)?.toInt() ?? 0;
          final historyDays = docs.where((d) => d.id != todayKey).toList();

          return ListView(
            padding: const EdgeInsets.all(12),
            children: [
              Container(
                decoration: SoftTheme.tileDecoration(),
                padding: const EdgeInsets.all(1.2),
                margin: const EdgeInsets.fromLTRB(0, 0, 0, 12),
                child: Card(
                  elevation: 0,
                  margin: EdgeInsets.zero,
                  shape: RoundedRectangleBorder(
                      borderRadius:
                          BorderRadius.circular(SoftTheme.radiusInner)),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Hoy',
                            style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 15,
                                color: SoftTheme.text)),
                        const SizedBox(height: 8),
                        _Stat(
                            label: 'Visitas hoy',
                            value: '${anonymous + registered}'),
                        _Stat(label: 'Desconocidos', value: '$anonymous'),
                        _Stat(label: 'Registrados', value: '$registered'),
                        const SizedBox(height: 12),
                        const Text('Clientes registrados hoy',
                            style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 15,
                                color: SoftTheme.text)),
                        const SizedBox(height: 4),
                        _Customers(date: todayKey),
                      ],
                    ),
                  ),
                ),
              ),
              const Text('Historial reciente',
                  style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                      color: SoftTheme.text)),
              const SizedBox(height: 4),
              const Text('Toca un día para ver su detalle y sus clientes.',
                  style: TextStyle(fontSize: 12, color: SoftTheme.textMuted)),
              const SizedBox(height: 8),
              if (historyDays.isEmpty)
                const Text('Sin visitas registradas aún.',
                    style: TextStyle(fontSize: 12, color: SoftTheme.textMuted)),
              ...historyDays.map((d) => _History(doc: d)),
              const SizedBox(height: 24),
            ],
          );
        },
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child:
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(label,
              style: const TextStyle(fontSize: 13, color: SoftTheme.text)),
          Text(value,
              style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                  color: SoftTheme.text)),
        ]),
      );
}

class _History extends StatelessWidget {
  const _History({required this.doc});
  final QueryDocumentSnapshot doc;
  @override
  Widget build(BuildContext context) {
    final data = doc.data() as Map<String, dynamic>;
    final anon = (data['anonymous'] as num?)?.toInt() ?? 0;
    final reg = (data['registered'] as num?)?.toInt() ?? 0;
    return Container(
      margin: const EdgeInsets.fromLTRB(0, 0, 0, 6),
      decoration: SoftTheme.tileDecoration(),
      padding: const EdgeInsets.all(1.2),
      child: Card(
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(SoftTheme.radiusInner)),
        child: ExpansionTile(
          dense: true,
          title:
              Text(doc.id, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle:
              Text('${anon + reg} visitas · $anon sin ver · $reg con perfil'),
          children: [_Customers(date: doc.id)],
        ),
      ),
    );
  }
}

class _Customers extends StatelessWidget {
  const _Customers({required this.date});
  final String date;
  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot>(
      stream: FirebaseFirestore.instance
          .collection('metrics')
          .doc('visits')
          .collection('history')
          .doc(date)
          .collection('customers')
          .snapshots(),
      builder: (context, snap) {
        if (snap.hasError)
          return const Text('No se pudieron cargar los clientes.',
              style: TextStyle(fontSize: 12, color: SoftTheme.textMuted));
        if (!snap.hasData || snap.data!.docs.isEmpty)
          return const Text('Sin clientes registrados este día.',
              style: TextStyle(fontSize: 12, color: SoftTheme.textMuted));
        final customers = snap.data!.docs
            .map((d) {
              final data = d.data() as Map<String, dynamic>;
              return (name: data['name']?.toString() ?? '', phone: d.id);
            })
            .where((c) => c.name.isNotEmpty)
            .toList();
        if (customers.isEmpty)
          return const Text('Sin clientes registrados este día.',
              style: TextStyle(fontSize: 12, color: SoftTheme.textMuted));
        return Column(
          children: [
            for (final c in customers)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.person_outline, size: 18),
                title: Text(c.name),
                subtitle: Text(c.phone),
                trailing: const Icon(Icons.history, size: 18),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) =>
                        CustomerDetailScreen(name: c.name, phone: c.phone))),
              ),
          ],
        );
      },
    );
  }
}
