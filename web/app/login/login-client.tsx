"use client";
import { useState, useRef } from "react";
import { auth } from "@/lib/firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { useRouter } from "next/navigation";

const AUTH_ERRORS: Record<string, string> = {
  "auth/invalid-phone-number": "Ese número no parece válido. Escribe el formato internacional (p. ej. +57 312 345 6789).",
  "auth/too-many-requests": "Demasiados intentos. Espera un momento e intenta de nuevo.",
  "auth/invalid-verification-code": "El código no coincide. Revisa e intenta de nuevo.",
  "auth/code-expired": "El código venció. Pide uno nuevo.",
  "auth/missing-phone-number": "Ingresa tu número de teléfono.",
  "auth/captcha-check-failed": "La verificación de seguridad falló. Recarga la página e intenta de nuevo.",
};

function authErrorMessage(e: unknown): string {
  const code =
    e && typeof e === "object" && "code" in e && typeof (e as { code?: unknown }).code === "string"
      ? (e as { code: string }).code
      : "";
  // Nunca se muestra el texto crudo de Firebase: no revela qué cuentas existen
  // ni el estado interno del SDK.
  return AUTH_ERRORS[code] ?? "No se pudo completar. Intenta de nuevo.";
}

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState<any>(null);
  const [error, setError] = useState("");
  const recaptchaRef = useRef<HTMLDivElement>(null);

  async function sendCode() {
    setError("");
    try {
      if (!recaptchaRef.current) return;
      const verifier = new RecaptchaVerifier(recaptchaRef.current, { size: "invisible" }, auth);
      const conf = await signInWithPhoneNumber(auth, phone, verifier);
      setConfirmation(conf);
    } catch (e) {
      setError(authErrorMessage(e));
    }
  }

  async function verify() {
    setError("");
    try {
      await confirmation.confirm(code);
      router.push("/mis-pedidos");
    } catch (e) {
      setError(authErrorMessage(e));
    }
  }

  return (
    <main className="max-w-md mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Ingresar</h1>
      {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
      {!confirmation ? (
        <div className="space-y-4">
          <input
            placeholder="+57..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
          <button onClick={sendCode} className="w-full bg-blue-600 text-white py-2 rounded">
            Enviar código
          </button>
          <div ref={recaptchaRef} />
        </div>
      ) : (
        <div className="space-y-4">
          <input
            placeholder="Código SMS"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full border rounded px-3 py-2"
          />
          <button onClick={verify} className="w-full bg-green-600 text-white py-2 rounded">
            Verificar
          </button>
        </div>
      )}
    </main>
  );
}
