export interface ProductVariant {
  /** Identificador estable dentro del producto (ej. "negro-m"). */
  id: string;
  color?: string;
  /** Hex del círculo de color en la web, ej. "#111111". */
  colorHex?: string;
  size?: string;
  /** Precio propio; si falta, se usa `price` del producto. */
  price?: number;
  stock: number;
}

export interface ProductSpec {
  label: string;
  value: string;
}

export interface Product {
  sku: string;
  name: string;
  price: number;
  stock: number;
  /** Orden visible en el catálogo (menor = primero). */
  priority?: number;
  isAvailable: boolean;
  images: string[];
  catalogIds: string[];
  description?: string;
  /** Marca para la ficha y la búsqueda. */
  brand?: string;
  /** Variantes con stock propio. Si está presente, manda sobre `stock`. */
  variants?: ProductVariant[];
  /** Video opcional (MP4) subido desde el admin. */
  videoUrl?: string;
  videoThumbnail?: string;
  /** Especificaciones libres: Material, Garantía, Peso… */
  specs?: ProductSpec[];
  /** Etiquetas para el buscador. */
  tags?: string[];
  featured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  updatedAt?: any;
}

export function variantLabel(variant: ProductVariant): string {
  return [variant.color, variant.size].filter(Boolean).join(" / ");
}

/** Opciones de orden visibles en el catálogo web. */
export type ProductSort =
  | "displayOrder"
  | "priceAsc"
  | "priceDesc"
  | "nameAsc"
  | "stockDesc"
  | "featuredFirst";

export const PRODUCT_SORT_OPTIONS: Array<{
  value: ProductSort;
  label: string;
}> = [
  { value: "displayOrder", label: "Orden de tienda" },
  { value: "featuredFirst", label: "Destacados primero" },
  { value: "priceAsc", label: "Precio: menor a mayor" },
  { value: "priceDesc", label: "Precio: mayor a menor" },
  { value: "nameAsc", label: "Nombre A-Z" },
  { value: "stockDesc", label: "Más stock primero" },
];

/** Ordena productos. `displayOrder` respeta el `priority` que pone el admin. */
export function sortProducts(
  list: Product[],
  sort: ProductSort
): Product[] {
  const copy = [...list];
  const byName = (a: Product, b: Product) =>
    (a.name ?? "").localeCompare(b.name ?? "", "es-CO");
  const byPriority = (a: Product, b: Product) => {
    const pa = Number(a.priority ?? 9999);
    const pb = Number(b.priority ?? 9999);
    return pa !== pb ? pa - pb : byName(a, b);
  };
  switch (sort) {
    case "priceAsc":
      copy.sort(
        (a, b) =>
          Number(a.price ?? 0) - Number(b.price ?? 0) || byPriority(a, b)
      );
      break;
    case "priceDesc":
      copy.sort(
        (a, b) =>
          Number(b.price ?? 0) - Number(a.price ?? 0) || byPriority(a, b)
      );
      break;
    case "nameAsc":
      copy.sort(byName);
      break;
    case "stockDesc":
      copy.sort(
        (a, b) =>
          productStock(b) - productStock(a) || byPriority(a, b)
      );
      break;
    case "featuredFirst":
      copy.sort((a, b) => {
        const fa = a.featured ? 0 : 1;
        const fb = b.featured ? 0 : 1;
        return fa !== fb ? fa - fb : byPriority(a, b);
      });
      break;
    case "displayOrder":
    default:
      copy.sort(byPriority);
      break;
  }
  return copy;
}

/** Stock total: el de las variantes si existen; si no, el del producto. */
export function productStock(product: Product): number {
  const variants = product.variants ?? [];
  if (Array.isArray(variants) && variants.length > 0) {
    return variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  }
  return Number(product.stock ?? 0);
}

/** Visible en el catálogo: si el admin desmarcó "Disponible para la venta", no se muestra ni como agotado. */
export function productVisible(product: Product): boolean {
  return product.isAvailable !== false;
}

/** Disponible para comprar si hay stock total > 0 y está visible. */
export function productAvailable(product: Product): boolean {
  if (!productVisible(product)) return false;
  return productStock(product) > 0;
}

/** Etiqueta en español para los estados del pedido. */
export function statusLabel(status: string): string {
  switch (status) {
    case "selecting": return "Seleccionando";
    case "pending": return "Pendiente";
    case "preparing": return "Preparando";
    case "ready": return "Listo";
    case "dispatched": return "Enviado";
    case "cancelled": return "Cancelado";
    default: return status;
  }
}

/** Precio base del producto, sin tocar las variantes. */
export function effectivePrice(product: Product, variant?: ProductVariant | null): number {
  if (variant && typeof variant.price === "number" && Number.isFinite(variant.price)) {
    return variant.price;
  }
  return Number(product.price ?? 0);
}

export interface Catalog {
  id: string;
  title: string;
  coverImage: string;
  isActive: boolean;
  isVisible: boolean;
  minOrderSubtotal: number;
  priority: number;
  seoTitle?: string;
  seoDescription?: string;
}

export interface StoreConfig {
  companyName: string;
  phoneContact: string;
  phoneContact2?: string;
  city: string;
  globalMinOrder: number;
  banners: Array<{
    id: string;
    imageUrl: string;
    redirectUrl?: string;
    isActive: boolean;
  }>;
  metaTitle?: string;
  metaDescription?: string;
  /** Enunciado de la home (slogan). */
  slogan?: string;
  keywords?: string[] | string;
  heroBadges?: Array<{
    text?: string;
    title?: string;
    description?: string;
  } | string>;
  ogImage?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
}

export interface Customer {
  phone: string;
  name: string;
  email: string;
  address: string;
  createdAt?: any;
}

export interface OrderItem {
  sku: string;
  name: string;
  catalogId: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  /** Presente cuando el producto tiene variantes. */
  variantId?: string;
  variantLabel?: string;
}

export interface Order {
  id: string;
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  deliveryAddress: string;
  items: OrderItem[];
  total: number;
  source?: "web";
  userId?: string;
  pdfPath?: string;
  pdfUrl?: string;
  emailSentAt?: any;
  pushSentAt?: any;
  status: "pending" | "preparing" | "ready" | "dispatched" | "cancelled" | "selecting";
  createdAt?: any;
}
