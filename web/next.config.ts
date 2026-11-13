import type { NextConfig } from "next";

// Cabeceras de seguridad para toda la web (sin CSP por ahora).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // 1 año sin "preload": celtoons.com está desplegando su HTTPS en Netlify;
  // preload/2 años se activan cuando el certificado esté estable.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["firebase", "@firebase/app", "@firebase/firestore", "@firebase/auth"],
  images: {
    // Solo los hosts reales de las imágenes de la tienda (Storage).
    // Un comodín dejaba a next/image como proxy abierto de imágenes ajenas.
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
      { protocol: "http", hostname: "127.0.0.1", port: "9199" },
    ],
    minimumCacheTTL: 300,
  },
  // Caché HTTP para archivos del crawler (ahorra ancho de banda; los datos siguen en 30/60 s).
  async headers() {
    const cache = [
      { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
      ...securityHeaders,
    ];
    return [
      { source: "/robots.txt", headers: cache },
      { source: "/sitemap.xml", headers: cache },
      { source: "/llms.txt", headers: cache },
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
