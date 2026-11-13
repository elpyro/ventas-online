import { getStoreConfig } from "@/lib/serverData";
import type { Metadata } from "next";
import Link from "next/link";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStoreConfig();
  const companyName = String(config?.companyName ?? "CELTOONS");
  return {
    title: "Política de privacidad",
    description: `Política de privacidad y tratamiento de datos personales de ${companyName} (${BASE_URL}). Qué datos recolectamos, para qué se usan y cuáles son tus derechos.`,
    alternates: { canonical: "/privacidad" },
    robots: { index: true, follow: true },
  };
}

const sectionTitle = "text-lg font-bold text-slate-900";
const paragraph = "mt-2 text-sm leading-6 text-slate-700";
const list = "mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-slate-700";

export default async function PrivacyPage() {
  const config = await getStoreConfig();
  const companyName = String(config?.companyName ?? "CELTOONS");
  const city = String(config?.city ?? "Bogotá");
  const phone = String(config?.phoneContact ?? "").replace(/\D/g, "");
  const contactHref = phone ? `https://wa.me/${phone}` : undefined;
  const today = new Date().toLocaleDateString("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {companyName} · celtoons.com
      </p>
      <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">
        Política de privacidad
      </h1>
      <p className="mt-2 text-xs text-muted-foreground">
        Última actualización: {today}
      </p>

      <p className={paragraph}>
        Esta política explica qué datos personales recolecta {companyName} a
        través de <Link href="/" className="font-medium text-primary hover:underline">celtoons.com</Link>,
        para qué se usan y qué derechos tienes como titular. Se basa en la
        normativa colombiana de protección de datos (Ley 1581 de 2012 y su
        decreto reglamentario). Es un texto general y no constituye asesoría
        legal.
      </p>

      <h2 className={`${sectionTitle} mt-8`}>1. Responsable del tratamiento</h2>
      <p className={paragraph}>
        El responsable del tratamiento de los datos personales es {companyName},
        con sede en {city}, Colombia. Puedes contactarnos por WhatsApp
        {contactHref && (
          <>
            {" "}en{" "}
            <a
              href={contactHref}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary hover:underline"
            >
              +{phone}
            </a>
          </>
        )}{" "}
        o desde los canales de atención publicados en el sitio.
      </p>

      <h2 className={`${sectionTitle} mt-8`}>2. Qué datos recolectamos</h2>
      <ul className={list}>
        <li>
          <strong>Datos de la página de confirmación y de los pedidos:</strong> nombre, correo
          electrónico, teléfono (WhatsApp) y dirección de entrega.
        </li>
        <li>
          <strong>Datos guardados en tu navegador:</strong> el contenido de tu
          carrito, tu perfil de cliente y el borrador de tu pedido (en
          <em> localStorage</em> de tu dispositivo).
        </li>
        <li>
          <strong>Visitas y uso del sitio:</strong> contadores anónimos de
          visitas y, si inicias sesión, tu identificador de cliente asociado a
          las compras del día.
        </li>
        <li>
          <strong>Comunicación por WhatsApp:</strong> los mensajes que nos
          envíes voluntariamente para coordinar tu pedido, entrega y pago.
        </li>
      </ul>

      <h2 className={`${sectionTitle} mt-8`}>3. Para qué usamos tus datos</h2>
      <p className={paragraph}>
        <strong>
          Los datos personales que nos confías serán tratados de forma privada
          y solo se usarán para contactarte en relación con tus pedidos o para
          enviarte publicidad de CELTOONS
        </strong>{" "}
        (ofertas, novedades y promociones de la tienda). En concreto:
      </p>
      <ul className={list}>
        <li>Procesar, confirmar y despachar tus pedidos.</li>
        <li>
          Coordinar contigo la entrega y el pago por WhatsApp, correo o los
          medios que uses con nosotros.
        </li>
        <li>Guardar tu historial de compras para tus próximas compras.</li>
        <li>
          Fin de publicidad y marketing directo de CELTOONS, siempre por los
          canales de contacto que nos hayas dado. Puedes oponerte en cualquier
          momento pidiendo no recibir más mensajes por WhatsApp o por correo.
        </li>
      </ul>
      <p className={paragraph}>
        No vendemos tus datos personales ni los compartimos con terceros con
        fines comerciales distintos a los anteriores.
      </p>

      <h2 className={`${sectionTitle} mt-8`}>
        4. Con quién se comparten tus datos
      </h2>
      <p className={paragraph}>
        Solo usamos encargados que son necesarios para que la tienda funcione:
      </p>
      <ul className={list}>
        <li>
          <strong>Google Firebase / Google Cloud:</strong> almacenamiento de
          pedidos, catálogo y configuración de la tienda.
        </li>
        <li>
          <strong>Netlify:</strong> alojamiento y entrega del sitio web.
        </li>
        <li>
          <strong>Resend:</strong> envío de correos transaccionales
          relacionados con tus pedidos (cuando está configurado).
        </li>
        <li>
          <strong>WhatsApp (Meta):</strong> mensajería para coordinar pedidos
          y enviarte información de la tienda.
        </li>
      </ul>

      <h2 className={`${sectionTitle} mt-8`}>5. Cookies y almacenamiento local</h2>
      <p className={paragraph}>
        No usamos cookies publicitarias ni de seguimiento de terceros. El
        navegador guarda localmente (localStorage) tu carrito, tu sesión y
        algunos datos de visita para que la tienda funcione. Puedes borrarlos
        en cualquier momento desde los ajustes de tu navegador; al hacerlo, se
        perderá el carrito y la sesión guardada en este dispositivo.
      </p>

      <h2 className={`${sectionTitle} mt-8`}>6. Tus derechos</h2>
      <p className={paragraph}>
        Como titular de tus datos personales, tienes derecho a:
      </p>
      <ul className={list}>
        <li>Conocer, actualizar y rectificar tus datos frente a {companyName}.</li>
        <li>Suprimir tus datos cuando proceda.</li>
        <li>
          Revocar la autorización de tratamiento de tus datos y oponerte al
          uso publicitario, escribiéndonos por WhatsApp o al canal de
          contacto publicado en el sitio.
        </li>
        <li>
          Presentar quejas ante la Superintendencia de Industria y Comercio
          de Colombia (SIC), autoridad competente en la materia.
        </li>
      </ul>
      <p className={paragraph}>
        Para ejercer estos derechos, escríbenos por WhatsApp{" "}
        {contactHref && (
          <a
            href={contactHref}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary hover:underline"
          >
            +{phone}
          </a>
        )}{" "}
        o por el canal de atención del sitio, indicando tu nombre y los datos
        de la solicitud. Respondemos dentro de los términos legales aplicables.
      </p>

      <h2 className={`${sectionTitle} mt-8`}>7. Seguridad de la información</h2>
      <p className={paragraph}>
        Aplicamos medidas razonables para proteger tus datos (acceso
        restringido a la administración, transmisión cifrada cuando el
        navegador lo soporta y almacenamiento en servicios con controles de
        seguridad). Ningún sistema es infalible; si detectamos un incidente que
        afecte tus datos, te informaremos por los medios de contacto que tengas
        registrados.
      </p>

      <h2 className={`${sectionTitle} mt-8`}>8. Menores de edad</h2>
      <p className={paragraph}>
        Esta tienda está dirigida a personas mayores de edad. No recolectamos
        conscientemente datos de menores de edad para fines propios; si
        detectas lo contrario, contáctanos para corregirlo.
      </p>

      <h2 className={`${sectionTitle} mt-8`}>9. Cambios a esta política</h2>
      <p className={paragraph}>
        Podemos actualizar esta política para reflejar cambios en el servicio o
        en la normativa. Publicaremos la versión vigente en celtoons.com/privacidad
        con la fecha de actualización correspondiente.
      </p>

      <p className="mt-10 rounded-xl border bg-muted/50 p-4 text-xs text-muted-foreground">
        Este es un documento general y no constituye asesoría legal. El
        responsable de la tienda debe revisarlo con un abogado para adaptarlo a
        las particularidades de su operación antes de considerarlo definitivo.
      </p>
    </main>
  );
}
