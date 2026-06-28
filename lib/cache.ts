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

const K_GRUPO = "rx_grupo_activo";
const K_MIEMBROS = "rx_miembros";
const K_VISTAS = "rx_alertas_vistas";

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
