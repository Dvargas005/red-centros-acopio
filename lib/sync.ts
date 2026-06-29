"use client";
// =============================================================
//  Sincronización oportunista del outbox (RX1)
//
//  Vacía la cola de salida (lib/offline.ts) hacia Supabase en cuanto hay
//  conexión, SIN acción del usuario. Se dispara:
//    - al recuperar conexión  (evento window 'online')   — ver components/ClientBoot
//    - al abrir la app / pantallas con datos               — ver components/ClientBoot
//    - tras crear un mensaje offline                       — best-effort
//
//  De-dup: las alertas se suben con UPSERT ... ON CONFLICT (grupo_id,
//  codigo_corto), así que reenviar el mismo evento no duplica filas. Se omite
//  `estado` a propósito (igual que upsertAlertaContenido) para no "regresar"
//  el estado de una alerta que ya avanzó en la nube.
// =============================================================

import { supabase, supabaseConfigured, asegurarSesion } from "./supabase";
import { flush, pendingCount } from "./offline";
import { hayConexion } from "./alertas";

let enCurso = false;

// Inserta/actualiza una fila pendiente respetando las reglas de de-dup.
async function insertarPendiente(
  table: string,
  payload: Record<string, unknown>
): Promise<{ error: unknown }> {
  if (table === "alertas") {
    // Copia sin `estado` + marca de subida; upsert idempotente por evento.
    const { estado: _omit, ...resto } = payload as Record<string, unknown>;
    void _omit;
    const row = { ...resto, subido_en: new Date().toISOString() };
    const { error } = await supabase
      .from("alertas")
      .upsert(row, { onConflict: "grupo_id,codigo_corto" });
    return { error };
  }
  // Tablas sin clave de de-dup conocida: insert simple.
  const { error } = await supabase.from(table).insert(payload);
  return { error };
}

// Vacía el outbox si hay conexión y sesión. Devuelve cuántas subieron.
// Es reentrante-seguro: si ya hay un flush en curso, no arranca otro.
export async function sincronizarOutbox(): Promise<number> {
  if (!supabaseConfigured || !hayConexion()) return 0;
  if (enCurso) return 0;
  if (pendingCount() === 0) return 0;
  enCurso = true;
  try {
    // Asegura una sesión: RLS exige auth.uid() de un miembro para insertar.
    await asegurarSesion().catch(() => null);
    return await flush(insertarPendiente);
  } catch {
    return 0;
  } finally {
    enCurso = false;
  }
}
