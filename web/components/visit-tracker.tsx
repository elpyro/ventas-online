"use client";
/**
 * Cuenta visitas en el contador de la tienda (`metrics/visits`) y en el
 * historial por día (`metrics/visits/history/{YYYY-MM-DD}`).
 *
 * - Contador de hoy: doc `metrics/visits` con `anonymous` / `registered` y
 *  `updatedAt`; las reglas solo admiten incrementos de 1.
 * - Historial: doc `metrics/visits/history/{YYYY-MM-DD}` con los mismos campos;
 *  cada visita de un día nuevo crea su doc (o incrementa la de hoy).
 * - Clientes registrados: si hay perfil, se guarda `{name, phone, at}` en la
 *  subcolección `metrics/visits/history/{fecha}/customers/{phone}` para el
 *  historial de clientes.
 *
 * No es anti-fraude: solo mide intención de visita y distingue "desconocidos"
 * (sin perfil guardado) de "registrados" (clientes con perfil en localStorage).
 * El dato solo lo lee la app de administración (contador + historial).
 */
import { useEffect, useRef } from "react";
import { doc, increment, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function VisitTracker() {
  const done = useRef(false);

  useEffect(() => {
    // Evita el doble conteo del StrictMode de React en desarrollo.
    if (done.current) return;
    done.current = true;
    try {
      const today = new Date().toISOString().slice(0, 10); // 2026-11-07 (UTC, consistente con el APK)
      const key = `visit-tracked-v2:${today}`;
      if (localStorage.getItem(key)) return;
      const raw = localStorage.getItem("customerProfile");
      let registered = false;
      let name = "";
      let phone = "";
      if (raw) {
        try {
          const c = JSON.parse(raw);
          registered = Boolean(c?.name) || Boolean(c?.email) || Boolean(c?.phone);
          name = c?.name ?? "";
          phone = c?.phone ?? "";
        } catch {
          // Perfil corrupto: se trata como visitante desconocido.
        }
      }
      const field = registered ? "registered" : "anonymous";
      setDoc(
        doc(db, "metrics", "visits"),
        { [field]: increment(1), updatedAt: serverTimestamp() },
        { merge: true }
      )
        .then(() => localStorage.setItem(key, "1"))
        .catch(() => {
          // Sin permiso o sin red: no romper la visita por esto.
        });

      // Entrada de hoy en el historial por día.
      setDoc(
        doc(db, "metrics", "visits", "history", today),
        { [field]: increment(1), updatedAt: serverTimestamp() },
        { merge: true }
      ).catch(() => {
        // Sin permiso o sin red: el contador igual se actualizó arriba.
      });

      // Registro del cliente (nombre) para el historial de visitas registradas.
      // El ID no puede contener "/" (separador de rutas) ni ser vacío.
      const customerId = phone.replace(/\//g, "_").trim();
      if (registered && customerId) {
        setDoc(
          doc(db, "metrics", "visits", "history", today, "customers", customerId),
          { name: name.trim(), phone, at: Timestamp.fromDate(new Date()) },
          { merge: true }
        ).catch(() => {
          // Sin permiso o sin red: el contador igual se actualizó arriba.
        });
      }
    } catch {
      // localStorage bloqueado (modo privado): se omite el conteo.
    }
  }, []);

  return null;
}
