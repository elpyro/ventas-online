# Web — instrucciones

Aplican solo a `web/`. Se combinan con el `AGENTS.md` de la raíz.

## Comandos

```powershell
cd web
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

## Estructura

- `app/`: rutas del App Router (`page.tsx`, `layout.tsx`).
- `components/`: componentes reutilizables.
- `lib/`: contextos (`auth.tsx`, `cart.tsx`), Firebase (`firebase.ts`),
  datos (`serverData.ts`) y tipos (`types.ts`).

## Render

- Server Component por defecto.
- `"use client"` solo si necesitas estado, efectos, eventos o APIs del navegador.
- No agregues `"use client"` a `layout.tsx` ni a páginas que solo leen datos.
- `AuthProvider` y `CartProvider` son de cliente y ya envuelven la app.

## Datos

- En el navegador: SDK de Firebase desde `lib/firebase.ts`. No crear otra instancia.
- En el servidor: `lib/serverData.ts` (REST de Firestore con `revalidate: 60`).
  El SDK de cliente no tiene credenciales de servidor y fallaría en build.
- No hardcodear URLs ni IDs de proyecto: usar `NEXT_PUBLIC_FIREBASE_*`.

## Convenciones

- Tipos del dominio en `lib/types.ts`. No agregar `any` nuevos.
- Precios y fechas con `Intl.NumberFormat("es-CO", ...)` y `currency: "COP"`.
- Imágenes con `next/image`, con `width`/`height` o `fill`.
- UI en español; nombres de código en inglés.
- Componentes en PascalCase; rutas en minúsculas.

## Seguridad

- Solo las variables `NEXT_PUBLIC_*` llegan al navegador. Nunca pongas secretos ahí.
- No confíes en el cliente para precios, stock ni totales.
- No desactives reglas de Firestore para "que funcione".

## Limitaciones conocidas

- El checkout crea pedidos con el SDK del cliente (con fallback `addDoc`);
  los precios los valida `createOrder` en el servidor.
- `/catalogo/[id]` carga los productos en el cliente; la ficha `/producto/[sku]`
  sí es servidor (metadata + JSON-LD).
- Los productos pueden tener `variants` con stock y precio propios; el servidor
  lo trata como fuente de verdad. El carrito lleva `variantId`.
- `lib/serverData.ts` usa `any` al parsear Firestore.
Al tocar estas zonas, propone migrarlas al servidor antes de ampliarlas.

## Verificación

```powershell
npm run build
npm run lint
```
