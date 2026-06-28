// =============================================================
//  Caché local para offline / de-dup (RX1)
//  Guarda el grupo activo y sus miembros en localStorage para poder
//  operar sin red, resolver teléfono -> nombre, y marcar qué alertas ya
//  vimos (evita re-procesar reenvíos de malla del mismo evento).
//
//  Todo va envuelto en try/catch: en modo privado o sin localStorage no
//  debe romper el flujo. Claves con namespace 'rx_*'.
// =============================================================

import { normalizarTel } from "./sms-protocol";
import type { Alerta, EstadoAlerta } from "./alertas";

const K_GRUPO = "rx_grupo_activo";
const K_MIEMBROS = "rx_miembros";
const K_VISTAS = "rx_alertas_vistas";
const K_ALERTAS = "rx_alertas";
const K_ULTIMA_VISTA = "rx_ultima_vista_tablero";

export type GrupoActivo = {
  id: string;
  nombre: string;
  tipo: string;
  codigo: string;
};
export type Miembro = {
  perfil_id?: string;
  nombre?: string;
  telefono?: string;
};

function leerJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function escribirJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ---------- Grupo activo + miembros ----------
export function guardarGrupoActivo(grupo: GrupoActivo, miembros: Miembro[]): boolean {
  const a = escribirJSON(K_GRUPO, grupo);
  const b = escribirJSON(K_MIEMBROS, miembros ?? []);
  return a && b;
}

export function leerGrupoActivo(): { grupo: GrupoActivo | null; miembros: Miembro[] } {
  return {
    grupo: leerJSON<GrupoActivo | null>(K_GRUPO, null),
    miembros: leerJSON<Miembro[]>(K_MIEMBROS, []),
  };
}

// Limpia solo la cache local del grupo activo (no toca la DB).
export function limpiarGrupoActivo(): void {
  try {
    localStorage.removeItem(K_GRUPO);
    localStorage.removeItem(K_MIEMBROS);
  } catch {
    /* localStorage no disponible: nada que limpiar */
  }
}

// Resuelve un teléfono a un nombre conocido del grupo (o undefined).
export function buscarMiembroPorTel(tel: string): string | undefined {
  const objetivo = normalizarTel(tel);
  if (!objetivo) return undefined;
  const miembros = leerJSON<Miembro[]>(K_MIEMBROS, []);
  const hit = miembros.find((m) => m.telefono && normalizarTel(m.telefono) === objetivo);
  return hit?.nombre || undefined;
}

// ---------- De-dup de alertas vistas ----------
export function marcarAlertaVista(id: string): boolean {
  try {
    const vistas = leerJSON<string[]>(K_VISTAS, []);
    if (!vistas.includes(id)) {
      vistas.push(id);
      return escribirJSON(K_VISTAS, vistas);
    }
    return true;
  } catch {
    return false;
  }
}

export function alertaYaVista(id: string): boolean {
  try {
    return leerJSON<string[]>(K_VISTAS, []).includes(id);
  } catch {
    return false;
  }
}

// ---------- Alertas locales (tablero offline + recibidas) ----------
// Se guardan por codigo_corto para que el tablero funcione sin red y para
// no perder lo recibido/creado mientras no se ha sincronizado.
export function guardarAlertaLocal(a: Alerta): void {
  try {
    const lista = leerJSON<Alerta[]>(K_ALERTAS, []);
    const i = lista.findIndex((x) => x.codigo_corto === a.codigo_corto && x.grupo_id === a.grupo_id);
    if (i >= 0) lista[i] = { ...lista[i], ...a };
    else lista.push(a);
    escribirJSON(K_ALERTAS, lista);
  } catch {
    /* sin localStorage: el tablero se servirá solo de la nube */
  }
}

export function leerAlertasLocales(grupoId?: string): Alerta[] {
  const lista = leerJSON<Alerta[]>(K_ALERTAS, []);
  return grupoId ? lista.filter((a) => a.grupo_id === grupoId) : lista;
}

export function actualizarEstadoLocal(grupoId: string, codigoCorto: string, estado: EstadoAlerta): void {
  try {
    const lista = leerJSON<Alerta[]>(K_ALERTAS, []);
    const i = lista.findIndex((x) => x.codigo_corto === codigoCorto && x.grupo_id === grupoId);
    if (i >= 0) {
      lista[i] = { ...lista[i], estado };
      escribirJSON(K_ALERTAS, lista);
    }
  } catch {
    /* sin localStorage: nada que actualizar */
  }
}

// ---------- Última actividad vista en el tablero (para notificación) ----------
export function leerUltimaVistaTablero(grupoId: string): string | null {
  const map = leerJSON<Record<string, string>>(K_ULTIMA_VISTA, {});
  return map[grupoId] ?? null;
}

export function guardarUltimaVistaTablero(grupoId: string, iso: string): void {
  try {
    const map = leerJSON<Record<string, string>>(K_ULTIMA_VISTA, {});
    map[grupoId] = iso;
    escribirJSON(K_ULTIMA_VISTA, map);
  } catch {
    /* sin localStorage: la notificación no persistirá entre visitas */
  }
}
