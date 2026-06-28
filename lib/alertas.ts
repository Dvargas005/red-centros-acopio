// =============================================================
//  Helpers de ALERTAS (RX1) — DB + presentación
//  Centraliza el acceso a Supabase para alertas y su historial, el modelo
//  de estados, colores y utilidades de presentación reutilizadas por el
//  composer (MSG-002), la recepción/puente (MSG-003/005) y el tablero
//  (MSG-004).
//
//  Regla clave de consistencia:
//   - El CONTENIDO de una alerta (rol/caso/desc/coords) se sincroniza con
//     upsertAlertaContenido(), que NUNCA toca `estado`: en una fila nueva el
//     estado cae al default ABIERTA y en una existente se deja como está,
//     evitando que un reenvío viejo "regrese" el estado.
//   - El ESTADO se cambia SOLO con cambiarEstado(), que además registra el
//     historial append-only.
// =============================================================

import { supabase } from "./supabase";
import { CASO_LEGIBLE, ROL_CODE } from "./sms-protocol";

export type EstadoAlerta =
  | "ABIERTA" | "EN_ATENCION" | "RESUELTA" | "CANCELADA" | "FALSA_ALARMA";

export type Alerta = {
  id?: string;            // uuid de Supabase (si proviene de la nube)
  codigo_corto: string;   // id corto del protocolo (4 chars)
  grupo_id: string;
  emisor_id?: string | null;
  rol?: string | null;    // enum largo: VICTIMA | RESCATISTA | FAMILIAR | CENTRO
  caso?: string | null;   // código de caso (ATR, HER, ...)
  descripcion?: string | null;
  lat?: number | null;
  lng?: number | null;
  estado: EstadoAlerta;
  creado_en?: string;     // ISO
  subido_en?: string;     // ISO
};

export type HistorialFila = {
  estado: EstadoAlerta;
  nota?: string | null;
  creado_en?: string;
};

// ---------- Modelo de estados ----------
export const ESTADOS: EstadoAlerta[] = [
  "ABIERTA", "EN_ATENCION", "RESUELTA", "CANCELADA", "FALSA_ALARMA",
];

export const ESTADO_LABEL: Record<EstadoAlerta, string> = {
  ABIERTA: "Abierta",
  EN_ATENCION: "En atención",
  RESUELTA: "Resuelta",
  CANCELADA: "Cancelada",
  FALSA_ALARMA: "Falsa alarma",
};

// Colores: ABIERTA rojo · EN_ATENCION naranja · RESUELTA verde · resto gris.
export const ESTADO_BADGE: Record<EstadoAlerta, string> = {
  ABIERTA: "border-danger text-danger",
  EN_ATENCION: "border-accent text-accent",
  RESUELTA: "border-ok text-ok",
  CANCELADA: "border-line text-white/40",
  FALSA_ALARMA: "border-line text-white/40",
};

// ---------- Presentación ----------
// Texto legible de la alerta: "Víctima atrapado", etc. Cae al rol/caso crudo.
export function describirAlerta(a: { rol?: string | null; caso?: string | null }): string {
  if (a.caso && CASO_LEGIBLE[a.caso]) return CASO_LEGIBLE[a.caso];
  const rolLegible = a.rol ? Object.entries(ROL_CODE).find(([, v]) => v === a.rol)?.[1] ?? a.rol : "";
  return [rolLegible, a.caso].filter(Boolean).join(" ") || "Alerta";
}

export function mapaUrl(lat?: number | null, lng?: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

// "hace cuánto" en español, a partir de un ISO timestamp.
export function haceCuanto(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const seg = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (seg < 60) return "hace un momento";
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

// ---------- Acceso a Supabase ----------

// Sincroniza el CONTENIDO de una alerta sin tocar el estado (ver cabecera).
// Devuelve el uuid de la fila y el posible error (para que el llamador decida
// si cae al outbox). El puente (MSG-005) ignora el error.
export async function upsertAlertaContenido(
  a: Alerta
): Promise<{ id: string | null; error: unknown }> {
  const row: Record<string, unknown> = {
    codigo_corto: a.codigo_corto,
    grupo_id: a.grupo_id,
    emisor_id: a.emisor_id ?? null,
    rol: a.rol ?? null,
    caso: a.caso ?? null,
    descripcion: a.descripcion ?? null,
    lat: a.lat ?? null,
    lng: a.lng ?? null,
    subido_en: new Date().toISOString(),
    // OJO: `estado` se omite a propósito (no regresar el estado).
  };
  const { data, error } = await supabase
    .from("alertas")
    .upsert(row, { onConflict: "grupo_id,codigo_corto" })
    .select("id")
    .single();
  return { id: (data as { id?: string } | null)?.id ?? null, error };
}

// Cambia el estado de una alerta (creándola si aún no existe en la nube) y
// registra el historial append-only.
export async function cambiarEstado(
  grupo_id: string,
  codigo_corto: string,
  estado: EstadoAlerta,
  opts?: { nota?: string | null; emisor_id?: string | null }
): Promise<{ ok: boolean; id?: string; error: unknown }> {
  const { data, error } = await supabase
    .from("alertas")
    .upsert(
      { grupo_id, codigo_corto, estado, subido_en: new Date().toISOString() },
      { onConflict: "grupo_id,codigo_corto" }
    )
    .select("id")
    .single();
  const id = (data as { id?: string } | null)?.id;
  if (error || !id) return { ok: false, error };

  const { error: eHist } = await supabase
    .from("alerta_estado_historial")
    .insert({ alerta_id: id, estado, cambiado_por: opts?.emisor_id ?? null, nota: opts?.nota ?? null });
  // El historial es secundario: si falla, el estado ya quedó actualizado.
  return { ok: true, id, error: eHist ?? null };
}

export async function fetchAlertasGrupo(grupo_id: string): Promise<Alerta[]> {
  const { data, error } = await supabase
    .from("alertas")
    .select("id, codigo_corto, grupo_id, emisor_id, rol, caso, descripcion, lat, lng, estado, creado_en, subido_en")
    .eq("grupo_id", grupo_id)
    .order("creado_en", { ascending: false });
  if (error) return [];
  return (data ?? []) as Alerta[];
}

export async function fetchHistorial(alerta_id: string): Promise<HistorialFila[]> {
  const { data, error } = await supabase
    .from("alerta_estado_historial")
    .select("estado, nota, creado_en")
    .eq("alerta_id", alerta_id)
    .order("creado_en", { ascending: true });
  if (error) return [];
  return (data ?? []) as HistorialFila[];
}

// ¿Hay forma de hablar con la nube ahora mismo?
export function hayConexion(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

// Enlace sms: prellenado para un miembro (o sin destinatario si no hay tel).
export function smsLink(tel: string | undefined | null, body: string): string {
  const destino = (tel ?? "").trim();
  return `sms:${destino}?body=${encodeURIComponent(body)}`;
}
