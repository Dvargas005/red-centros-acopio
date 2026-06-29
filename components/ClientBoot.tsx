"use client";
// =============================================================
//  ClientBoot — arranque del lado cliente (global, montado en el layout)
//
//  Hace dos cosas, en cualquier pantalla:
//   1) Registra el service worker (PWA offline). Solo en producción para no
//      interferir con el HMR de `next dev`. Pruébalo con `npm run build &&
//      npm start`.
//   2) Sincronización oportunista del outbox: vacía la cola pendiente al abrir
//      la app y cada vez que el navegador recupera conexión (evento 'online').
//      Así las alertas creadas/recibidas offline suben solas a Supabase.
// =============================================================

import { useEffect } from "react";
import { sincronizarOutbox } from "@/lib/sync";

export default function ClientBoot() {
  useEffect(() => {
    // 1) Service worker (solo producción).
    if (
      process.env.NODE_ENV === "production" &&
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      const registrar = () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {
          /* sin SW: la app sigue funcionando online */
        });
      };
      if (document.readyState === "complete") registrar();
      else window.addEventListener("load", registrar, { once: true });
    }

    // 2) Sync oportunista: al abrir y al reconectar.
    void sincronizarOutbox();
    const alReconectar = () => { void sincronizarOutbox(); };
    window.addEventListener("online", alReconectar);
    return () => window.removeEventListener("online", alReconectar);
  }, []);

  return null;
}
