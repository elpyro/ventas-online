// Datos de prueba para la carga inicial de Firestore.
// Edita libremente antes de volver a ejecutar `npm run seed`.

export const storeConfig = {
  companyName: "Ventas Online",
  // Número en formato internacional, sin + ni espacios (se usa para wa.me).
  phoneContact: "573125866072",
  city: "Bogotá",
  globalMinOrder: 10,
  banners: [
    {
      id: "banner-demo",
      imageUrl: "https://picsum.photos/seed/ventas-online/1200/300",
      redirectUrl: "/catalogos",
      isActive: true,
    },
  ],
  metaTitle: "Ventas Online — Venta Mayorista",
  metaDescription: "Compra al por mayor en Bogotá, Colombia. Catálogos de hogar y tecnología con pedido coordinado por WhatsApp y despachos a todo el país.",
  keywords: [
    "venta mayorista online",
    "tienda mayorista",
    "hogar mayorista",
    "tecnología al por mayor",
  ],
  ogImage: "",
  instagram: "",
  facebook: "",
  tiktok: "",
};

export const catalogs = [
  {
    id: "hogar",
    data: {
      title: "Hogar",
      coverImage: "https://picsum.photos/seed/hogar/600/400",
      isActive: true,
      isVisible: true,
      minOrderSubtotal: 20,
      priority: 1,
    },
  },
  {
    id: "tecnologia",
    data: {
      title: "Tecnología",
      coverImage: "https://picsum.photos/seed/tecnologia/600/400",
      isActive: true,
      isVisible: true,
      minOrderSubtotal: 30,
      priority: 2,
    },
  },
];

export const products = [
  {
    sku: "SKU-001",
    name: "Juego de ollas 5 piezas",
    price: 45.9,
    stock: 12,
    isAvailable: true,
    images: ["https://picsum.photos/seed/ollas/600/400"],
    catalogIds: ["hogar"],
    description: "Set de ollas antiadherentes para uso diario.",
    brand: "HogarPro",
    tags: ["ollas", "cocina", "set"],
    specs: [
      { label: "Material", value: "Acero inoxidable antiadherente" },
      { label: "Piezas", value: "5" },
      { label: "Garantía", value: "1 año" },
    ],
    featured: true,
  },
  {
    sku: "SKU-002",
    name: "Organizador de cocina",
    price: 18.5,
    stock: 25,
    isAvailable: true,
    images: ["https://picsum.photos/seed/cocina/600/400"],
    catalogIds: ["hogar"],
    description: "Organizador modular para utensilios de cocina.",
    brand: "HogarPro",
    tags: ["organizador", "cocina"],
    specs: [{ label: "Material", value: "Plástico libre de BPA" }],
  },
  {
    sku: "SKU-003",
    name: "Audífonos Bluetooth",
    price: 29.99,
    stock: 8,
    isAvailable: true,
    images: ["https://picsum.photos/seed/audifonos/600/400"],
    catalogIds: ["tecnologia"],
    description: "Audífonos inalámbricos con estuche de carga.",
    brand: "SoundMax",
    tags: ["audífonos", "bluetooth", "inalámbrico"],
    specs: [
      { label: "Autonomía", value: "6 h (estuche 24 h)" },
      { label: "Bluetooth", value: "5.3" },
      { label: "Garantía", value: "6 meses" },
    ],
    // Variantes con stock propio: color.
    variants: [
      { id: "negro", color: "Negro", colorHex: "#111111", stock: 4 },
      { id: "blanco", color: "Blanco", colorHex: "#f8fafc", stock: 3 },
      { id: "azul", color: "Azul", colorHex: "#2563eb", stock: 1 },
    ],
    featured: true,
  },
  {
    sku: "SKU-004",
    name: "Cargador rápido 20W",
    price: 15,
    stock: 0,
    isAvailable: false,
    images: ["https://picsum.photos/seed/cargador/600/400"],
    catalogIds: ["tecnologia"],
    description: "Cargador de pared USB-C de 20W. Temporalmente agotado.",
    brand: "Voltech",
    tags: ["cargador", "usb-c", "20w"],
    specs: [{ label: "Potencia", value: "20W" }],
  },
  {
    sku: "SKU-005",
    name: "Lámpara LED de escritorio",
    price: 12.75,
    stock: 40,
    isAvailable: true,
    images: ["https://picsum.photos/seed/lampara/600/400"],
    catalogIds: ["hogar", "tecnologia"],
    description: "Lámpara LED regulable con brazo flexible.",
    brand: "LumiMax",
    tags: ["lámpara", "led", "escritorio"],
    specs: [
      { label: "Potencia", value: "9W" },
      { label: "Temperatura", value: "2700K–6500K" },
    ],
    variants: [
      { id: "negro", color: "Negro", colorHex: "#111111", stock: 22 },
      { id: "blanco", color: "Blanco", colorHex: "#f8fafc", stock: 18 },
    ],
  },
];
