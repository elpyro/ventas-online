import '../theme/soft_theme.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'panel_screen.dart';
import 'catalogs_screen.dart';
import 'config_screen.dart';
import 'customers_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _registerFcm();
    FirebaseMessaging.onMessage.listen((msg) {
      final n = msg.notification;
      if (n != null && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('${n.title}: ${n.body}')));
      }
    });
  }

  Future<void> _registerFcm() async {
    // En el emulador (o sin Google Play Services) esto falla: no es crítico.
    try {
      // Android 13+ no entrega pushes sin el permiso en Runtime.
      // En versiones anteriores Android lo ignora y devuelve authorized.
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await FirebaseFirestore.instance
            .collection('admin_tokens')
            .doc(token)
            .set({'createdAt': FieldValue.serverTimestamp()});
      }
    } catch (_) {
      // Sin notificaciones la app sigue funcionando.
    }
  }

  @override
  Widget build(BuildContext context) {
    final screens = const [
      PanelScreen(),
      CustomersScreen(),
      CatalogsScreen(),
      ConfigScreen(),
    ];
    return Scaffold(
      backgroundColor: SoftTheme.background,
      appBar: AppBar(
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Ventas Online',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            Text('Panel de administración',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w400)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Cerrar sesión',
            onPressed: () => FirebaseAuth.instance.signOut(),
          ),
        ],
      ),
      body: screens[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Panel',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outlined),
            selectedIcon: Icon(Icons.people),
            label: 'Clientes',
          ),
          NavigationDestination(
            icon: Icon(Icons.grid_view_outlined),
            selectedIcon: Icon(Icons.grid_view),
            label: 'Catálogos',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Config',
          ),
        ],
      ),
    );
  }
}
