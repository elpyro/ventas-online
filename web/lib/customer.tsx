"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface StoredCustomer {
  name: string;
  email: string;
  phone: string;
  address: string;
}

interface CustomerContextValue {
  customer: StoredCustomer | null;
  loaded: boolean;
  /** Guarda al cliente en este navegador (tras una compra). */
  saveCustomer: (customer: StoredCustomer) => void;
  /** Borra los datos del cliente y el carrito (cerrar sesión). */
  clearCustomer: () => void;
}

const CustomerContext = createContext<CustomerContextValue | null>(null);
const STORAGE_KEY = "customerProfile";

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<StoredCustomer | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCustomer(JSON.parse(raw));
    } catch {
      // Un dato corrupto en localStorage no debe romper la app.
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoaded(true);
    }
  }, []);

  function saveCustomer(next: StoredCustomer) {
    setCustomer(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Si no hay espacio o está bloqueado, el pedido igual se creó.
    }
  }

  function clearCustomer() {
    setCustomer(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  return (
    <CustomerContext.Provider value={{ customer, loaded, saveCustomer, clearCustomer }}>
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error("useCustomer must be used within CustomerProvider");
  return ctx;
}

/** Normaliza teléfonos a "+<dígitos>" (igual que el backend). */
export function normalizePhone(value: unknown): string {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return `+${digits}`;
}
