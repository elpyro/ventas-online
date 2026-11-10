import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["firebase", "@firebase/app", "@firebase/firestore", "@firebase/auth"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    minimumCacheTTL: 300,
  },
  // Caché HTTP para archivos del crawler (ahorra ancho de banda; los datos siguen en 30/60 s).
  async headers() {
    const cache = [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }];
    return [
      { source: "/robots.txt", headers: cache },
      { source: "/sitemap.xml", headers: cache },
      { source: "/llms.txt", headers: cache },
    ];
  },
};

export default nextConfig;
