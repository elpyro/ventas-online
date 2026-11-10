import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * Reglas para buscadores y asistentes de IA.
 * Se permite indexación de catálogos y productos; carrito/checkout quedan fuera.
 * El resumen para IA vive en /llms.txt (generado desde Firestore).
 */
const PRIVATE_PATHS = ["/checkout", "/carrito", "/mis-pedidos", "/login", "/buscar", "/api/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "GPTBot", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "ChatGPT-User", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "ClaudeBot", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "Claude-Web", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "anthropic-ai", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "PerplexityBot", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "Meta-ExternalAgent", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "CCBot", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "cohere-ai", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "Google-Extended", allow: "/", disallow: PRIVATE_PATHS },
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
