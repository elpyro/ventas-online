import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../screens/visits_detail_screen.dart';
import '../theme/soft_theme.dart';

/// Tarjeta compacta de visitas (Panel). Solo muestra el resumen para ocupar
/// menos de la mitad del espacio original. El detalle completo vive en
/// VisitsDetailScreen (master-detail).
class VisitsStatsCard extends StatefulWidget {
  const VisitsStatsCard({super.key});

  @override
  State<VisitsStatsCard> createState() => _VisitsStatsCardState();
}

class _VisitsStatsCardState extends State<VisitsStatsCard> {
  static const int _historyLimit = 30;

  CollectionReference<Map<String, dynamic>> get _historyRef =>
      FirebaseFirestore.instance
          .collection('metrics')
          .doc('visits')
          .collection('history');

  String _todayKey() =>
      DateTime.now().toUtc().toIso8601String().substring(0, 10);

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot>(
      stream: _historyRef.limit(_historyLimit).snapshots(),
      builder: (context, snap) {
        if (snap.hasError) {
          return Container(
            decoration: SoftTheme.tileDecoration(),
            padding: const EdgeInsets.all(1.2),
            child: Card(
              elevation: 0,
              margin: EdgeInsets.zero,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(SoftTheme.radiusInner)),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                    'No se pudo cargar el contador de visitas: ${snap.error}',
                    style: const TextStyle(
                        fontSize: 12, color: SoftTheme.textMuted)),
              ),
            ),
          );
        }
        if (!snap.hasData) {
          return Container(
            decoration: SoftTheme.tileDecoration(),
            padding: const EdgeInsets.all(1.2),
            child: Card(
              elevation: 0,
              margin: EdgeInsets.zero,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(SoftTheme.radiusInner)),
              child: const Padding(
                padding: EdgeInsets.all(16),
                child: Center(
                    child: SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2))),
              ),
            ),
          );
        }
        final fetched = snap.data!.docs;
        final docs = [...fetched]..sort((a, b) => b.id.compareTo(a.id));
        final todayKey = _todayKey();
        QueryDocumentSnapshot? todayDoc;
        for (final d in docs) {
          if (d.id == todayKey) {
            todayDoc = d;
            break;
          }
        }
        final todayData = todayDoc == null
            ? const <String, dynamic>{}
            : todayDoc.data() as Map<String, dynamic>;
        final anonymous = (todayData['anonymous'] as num?)?.toInt() ?? 0;
        final registered = (todayData['registered'] as num?)?.toInt() ?? 0;
        var totalAnon = 0;
        var totalReg = 0;
        for (final d in docs) {
          final data = d.data() as Map<String, dynamic>;
          totalAnon += (data['anonymous'] as num?)?.toInt() ?? 0;
          totalReg += (data['registered'] as num?)?.toInt() ?? 0;
        }

        return Container(
          decoration: SoftTheme.tileDecoration(),
          padding: const EdgeInsets.all(1.2),
          child: Card(
            elevation: 0,
            margin: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(SoftTheme.radiusInner)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(14),
                          gradient: const LinearGradient(
                              colors: [SoftTheme.cBlue, SoftTheme.cSky],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight),
                          boxShadow: [
                            BoxShadow(
                                color: SoftTheme.cBlue.withValues(alpha: 0.3),
                                blurRadius: 10,
                                offset: const Offset(0, 4))
                          ],
                        ),
                        child: const Icon(Icons.insights,
                            size: 22, color: Colors.white),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Visitas de la tienda',
                                style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: SoftTheme.text)),
                            Text(
                                '${totalAnon + totalReg} total · ${anonymous + registered} hoy',
                                style: const TextStyle(
                                    fontSize: 12, color: SoftTheme.textMuted)),
                          ],
                        ),
                      ),
                      SoftBadge(
                          text: '${anonymous + registered} hoy',
                          color: SoftTheme.cBlue,
                          size: 12),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    children: [
                      SoftBadge(
                          text: 'Desconocidos $anonymous',
                          color: SoftTheme.cViolet,
                          size: 11),
                      SoftBadge(
                          text: 'Registrados $registered',
                          color: SoftTheme.cEmerald,
                          size: 11),
                    ],
                  ),
                  const SizedBox(height: 10),
                  SoftTheme.fabButton(
                    label: 'Ver detalle de visitas',
                    icon: Icons.history,
                    onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute(
                            builder: (_) => const VisitsDetailScreen())),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
