import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

enum SnackType { success, error, info }

/// Design System: 3D suave — Redefinida desde la lista de productos.
/// Patrón único en toda la APK:
/// - Tarjeta con borde 3D sutil: gradiente blanco→gris + sombra suave + brillo.
/// - Dato importante = pastilla con contenedor suave (color con alpha) + texto intenso.
/// - Radios: tile 17, inner 16, thumb 14, badge pill 20, botón 16.
/// - Separaciones: margen 12/6, padding 12, spacing 6/4.
abstract final class SoftTheme {
  // Tokens base (copiados del _ProductTile)
  static const background = Color(0xFFF0F4F8);
  static const surface = Colors.white;
  static const surfaceSoft = Color(0xFFF8FAFC);
  static const inputBg = Color(0xFFE2E8F0);
  static const outline = Color(0xFFE2E8F0);
  static const text = Color(0xFF1E293B);
  static const textMuted = Color(0xFF64748B);

  // Paleta multi-color
  static const cBlue = Color(0xFF2563EB);
  static const cSky = Color(0xFF0EA5E9);
  static const cViolet = Color(0xFF7C3AED);
  static const cEmerald = Color(0xFF059669);
  static const cAmber = Color(0xFFD97706);
  static const cRose = Color(0xFFE11D48);

  static const accentBlue = cBlue;
  static const accentEmerald = cEmerald;
  static const accentAmber = cAmber;

  // Radios (idénticos a la lista)
  static const radiusTile = 17.0;
  static const radiusInner = 16.0;
  static const radiusThumb = 14.0;
  static const radiusBadge = 20.0;
  static const radiusButton = 16.0;
  static const radiusInput = 12.0;

  // Sombras del tile (mismas que _ProductTile)
  static List<BoxShadow> get tileShadow => [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.14),
          blurRadius: 10,
          offset: const Offset(0, 4),
        ),
        BoxShadow(
          color: Colors.white.withValues(alpha: 0.7),
          blurRadius: 2,
          offset: const Offset(0, -1),
        ),
      ];

  static List<BoxShadow> get thumbShadow => [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.08),
          blurRadius: 6,
          offset: const Offset(0, 2),
        ),
      ];

  static List<BoxShadow> get cardShadow => [
        BoxShadow(
          color: const Color(0xFF64748B).withValues(alpha: 0.14),
          blurRadius: 20,
          offset: const Offset(0, 8),
        ),
        BoxShadow(
          color: Colors.white.withValues(alpha: 0.9),
          blurRadius: 4,
          offset: const Offset(0, -2),
        ),
      ];

  /// Decoración exterior del tile (igual que la lista de productos).
  /// [borderColor] resalta el tile, p. ej. cuando está seleccionado.
  static BoxDecoration tileDecoration({Color? borderColor}) => BoxDecoration(
        borderRadius: BorderRadius.circular(radiusTile),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white,
            outline.withValues(alpha: 0.6),
          ],
        ),
        border: borderColor != null
            ? Border.all(color: borderColor, width: 1.6)
            : null,
        boxShadow: tileShadow,
      );

  static BoxDecoration cardDecoration({double radius = 24}) => BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.white, surfaceSoft],
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
        boxShadow: cardShadow,
      );

  /// Badge = contenedor suave (color con alpha) + texto intenso. Patrón que te gustó.
  static BoxDecoration badgeDecoration(Color base) => BoxDecoration(
        color: base.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(radiusBadge),
        border: Border.all(color: base.withValues(alpha: 0.12)),
      );

  static TextStyle badgeTextStyle(Color base, {double size = 11}) => TextStyle(
        fontSize: size,
        fontWeight: FontWeight.w800,
        color: base,
        letterSpacing: 0.2,
      );

  static TextStyle badgeStockStyle(Color base, {double size = 11}) => TextStyle(
        fontSize: size,
        fontWeight: FontWeight.w700,
        color: base,
      );

  /// Color por estado del pedido (solo para badges, mismo patrón suave)
  static Color orderColor(String status) {
    switch (status) {
      case 'selecting':
        return const Color(0xFF8B5CF6);
      case 'pending':
        return const Color(0xFFF59E0B);
      case 'preparing':
        return const Color(0xFF0EA5E9);
      case 'ready':
        return const Color(0xFF10B981);
      case 'dispatched':
        return const Color(0xFF2563EB);
      case 'cancelled':
        return const Color(0xFFE11D48);
      default:
        return const Color(0xFF64748B);
    }
  }

  static BoxDecoration inputDecoration({double radius = 16}) => BoxDecoration(
        color: inputBg.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(radius),
        border:
            Border.all(color: const Color(0xFFE2E8F0).withValues(alpha: 0.5)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F172A).withValues(alpha: 0.08),
            blurRadius: 5,
            offset: const Offset(0, 2),
          ),
        ],
      );

  static Widget softButton({
    required String label,
    required VoidCallback? onPressed,
    IconData? icon,
    bool primary = true,
    Color? color,
    double height = 48,
  }) {
    final c = color ?? cBlue;
    return GestureDetector(
      onTap: onPressed,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 100),
        curve: Curves.easeOut,
        height: height,
        width: double.infinity,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radiusButton),
          gradient: primary
              ? LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [c.withValues(alpha: 0.90), c],
                )
              : const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.white, surfaceSoft],
                ),
          boxShadow: [
            BoxShadow(
              color: primary
                  ? c.withValues(alpha: 0.25)
                  : const Color(0xFF64748B).withValues(alpha: 0.12),
              blurRadius: 12,
              offset: const Offset(0, 6),
            ),
          ],
          border: Border.all(
            color: primary
                ? c.withValues(alpha: 0.3)
                : Colors.white.withValues(alpha: 0.6),
          ),
        ),
        child: Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 20, color: primary ? Colors.white : text),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: Text(
                  label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: primary ? Colors.white : text,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Botón estándar tipo FAB extended: pastilla, icono + texto.
  /// Guardar cambios / acciones principales.
  static Widget fabButton({
    required String label,
    required VoidCallback? onPressed,
    IconData? icon,
  }) {
    final c = onPressed == null ? null : _primaryContainer;
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: ElevatedButton.icon(
        onPressed: onPressed,
        icon: icon != null ? Icon(icon, size: 20) : const SizedBox.shrink(),
        label: Text(label),
        style: ElevatedButton.styleFrom(
          backgroundColor: c ?? const Color(0xFFE2E8F0),
          foregroundColor: const Color(0xFF1E293B),
          elevation: 0,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  /// Botón eliminar: un poco distinto, tonal rojo suave, no primario.
  static Widget fabDeleteButton({
    required String label,
    required VoidCallback? onPressed,
    IconData? icon,
  }) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: icon != null ? Icon(icon, size: 20) : const SizedBox.shrink(),
        label: Text(label),
        style: OutlinedButton.styleFrom(
          backgroundColor: const Color(0xFFFEF2F2),
          foregroundColor: const Color(0xFF991B1B),
          side: BorderSide(color: const Color(0xFFFECACA)),
          elevation: 0,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  static const _primaryContainer = Color(0xFFDBEAFE); // azul pálido tipo FAB

  static void showSnack(BuildContext context, String message,
      {SnackType type = SnackType.info}) {
    final bg = switch (type) {
      SnackType.success => cEmerald,
      SnackType.error => cRose,
      SnackType.info => cBlue,
    };
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: const TextStyle(
              color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13),
        ),
        backgroundColor: bg,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    );
  }

  static ThemeData get materialTheme => ThemeData(
        scaffoldBackgroundColor: background,
        colorScheme: ColorScheme.fromSeed(
          seedColor: cBlue,
          primary: cBlue,
          secondary: cViolet,
          tertiary: cEmerald,
        ),
        cardTheme: const CardThemeData(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(17)),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: inputBg.withValues(alpha: 0.4),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(999)),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            textStyle:
                const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
          ),
        ),
        snackBarTheme: SnackBarThemeData(
          backgroundColor: cBlue,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: background,
          foregroundColor: text,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: false,
        ),
      );
}

/// Badge suave genérico (contenedor suave + texto intenso)
class SoftBadge extends StatelessWidget {
  const SoftBadge({
    super.key,
    required this.text,
    required this.color,
    this.size = 11,
    this.icon,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
  });

  final String text;
  final Color color;
  final double size;
  final IconData? icon;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: SoftTheme.badgeDecoration(color),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: color),
            const SizedBox(width: 4),
          ],
          Text(text, style: SoftTheme.badgeStockStyle(color, size: size)),
        ],
      ),
    );
  }
}

/// Contenedor tipo tile (mismo que la lista de productos) para cualquier tarjeta
class SoftTile extends StatelessWidget {
  const SoftTile({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.selected = false,
    this.margin = const EdgeInsets.fromLTRB(12, 6, 12, 6),
    this.padding = const EdgeInsets.all(12),
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  /// Resalta el tile con borde azul (p. ej. cuando está seleccionado).
  final bool selected;
  final EdgeInsetsGeometry margin;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      decoration: SoftTheme.tileDecoration(
        borderColor: selected ? SoftTheme.cBlue : null,
      ),
      padding: const EdgeInsets.all(1.2),
      child: Card(
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SoftTheme.radiusInner),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          onLongPress: onLongPress,
          child: Padding(
            padding: padding,
            child: child,
          ),
        ),
      ),
    );
  }
}

/// Thumbnail 88x88 con el radio y sombra de la lista
class SoftThumbnail extends StatelessWidget {
  const SoftThumbnail({super.key, required this.url, this.featured = false});

  final String url;
  final bool featured;

  @override
  Widget build(BuildContext context) {
    final placeholderColor = SoftTheme.inputBg;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(SoftTheme.radiusThumb),
        boxShadow: SoftTheme.thumbShadow,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(SoftTheme.radiusThumb),
        child: SizedBox(
          width: 88,
          height: 88,
          child: url.isEmpty
              ? Container(
                  color: placeholderColor,
                  child: Icon(Icons.image_outlined,
                      size: 30, color: SoftTheme.textMuted),
                )
              : Stack(
                  fit: StackFit.expand,
                  children: [
                    CachedNetworkImage(
                      imageUrl: url,
                      fit: BoxFit.cover,
                      // Miniatura 88×88: solo se limita el ancho. Fijar ancho y
                      // alto a la vez deforma la imagen si no es cuadrada.
                      // maxWidthDiskCache guarda en disco la versión reducida
                      // para no llenar el teléfono con fotos a tamaño original.
                      memCacheWidth: 176,
                      maxWidthDiskCache: 176,
                      errorWidget: (_, __, ___) => Container(
                        color: placeholderColor,
                        child: Icon(Icons.image_not_supported_outlined,
                            size: 30, color: SoftTheme.textMuted),
                      ),
                      placeholder: (_, __) => Container(
                        color: placeholderColor,
                        child: const Center(
                          child: SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2)),
                        ),
                      ),
                    ),
                    if (featured)
                      Positioned(
                        top: 4,
                        left: 4,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFBBF24),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.star,
                              size: 12, color: Colors.black),
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

class SoftScreen extends StatelessWidget {
  const SoftScreen({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(maxWidth: 448),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
      color: SoftTheme.background,
      child: child,
    );
  }
}
