// =============================================================
//  Protocolo de Mensajería de Emergencia v2 (RX1)
//  Reemplaza el protocolo de acopio v1; conserva el rol CENTRO como
//  subconjunto para compatibilidad con el caso original de centros.
//
//  Diseñado para caber en 1 segmento SMS (<=160 chars), ser tecleable
//  y decodificar a un objeto plano (la "especie de JSON" que se pidió).
//
//  Formato:
//    RX1 <id> <op> <args> [@lat,lng] [tN]
//
//    id   -> 4 chars base36 (generarId)
//    op   -> S alerta | E estado | N necesito | I info / a salvo
//    @lat,lng -> ubicación opcional (decimal)
//    tN   -> TTL opcional para reenvío en malla (saltos restantes)
//
//  Roles (primer arg en op S/N/I cuando aplica):
//    V VICTIMA · R RESCATISTA · F FAMILIAR · C CENTRO
//
//  Ejemplos:
//    RX1 7g2k S V ATR @10.601,-66.934 t3   -> víctima atrapada, con ubicación, TTL 3
//    RX1 7g2k E ATN                        -> alerta pasa a EN_ATENCION
//    RX1 9a1z N C MED                      -> centro necesita atención médica
//    RX1 4b8p I V SAL                      -> víctima reporta estar a salvo
// =============================================================

const PREFIX = "RX1";

// ---------- ROLES ----------
export const ROL_CODE: Record<string, string> = {
  V: "VICTIMA", R: "RESCATISTA", F: "FAMILIAR", C: "CENTRO",
};
export const CODE_ROL: Record<string, string> = Object.fromEntries(
  Object.entries(ROL_CODE).map(([k, v]) => [v, k])
);

// ---------- DICCIONARIO DE CASOS ----------
// Mapa caso -> texto legible en español, agrupado por rol. La UI usa
// CASO_LEGIBLE para mostrar "Víctima atrapada", etc.
export const CASOS_POR_ROL: Record<string, Record<string, string>> = {
  V: {
    ATR: "Atrapado",
    HER: "Herido",
    AGU: "Agua",
    MED: "Atención médica",
    SAL: "A salvo",
  },
  R: {
    DESP: "Despejado",
    PER: "Personal",
    EQP: "Equipo",
    VIV: "Hallado vivo",
    FALL: "Hallado sin vida",
    PEL: "Peligro estructural",
  },
  F: {
    BUS: "Busco",
    RSAL: "Reporto a salvo",
    RHER: "Reporto herido",
    RDES: "Reporto desaparecido",
  },
  C: {
    NEC: "Necesita",
    SOB: "Sobra",
    LLE: "Lleno",
    CER: "Cerrado",
  },
};

// Texto legible plano por código de caso (incluye el rol como prefijo legible).
const ROL_LEGIBLE: Record<string, string> = {
  V: "Víctima", R: "Rescatista", F: "Familiar", C: "Centro",
};
export const CASO_LEGIBLE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [rol, casos] of Object.entries(CASOS_POR_ROL)) {
    for (const [caso, txt] of Object.entries(casos)) {
      // p.ej. ATR -> "Víctima atrapada" (forma natural en minúscula tras el rol)
      out[caso] = `${ROL_LEGIBLE[rol]} ${txt.toLowerCase()}`;
    }
  }
  return out;
})();

// Set de todos los códigos de caso válidos.
const CASOS_VALIDOS = new Set(
  Object.values(CASOS_POR_ROL).flatMap((m) => Object.keys(m))
);

// ---------- ESTADOS (op E) ----------
export const ESTADO_CODE: Record<string, string> = {
  ABI: "ABIERTA",
  ATN: "EN_ATENCION",
  RES: "RESUELTA",
  CAN: "CANCELADA",
  FAL: "FALSA_ALARMA",
};
export const CODE_ESTADO: Record<string, string> = Object.fromEntries(
  Object.entries(ESTADO_CODE).map(([k, v]) => [v, k])
);

// ---------- TIPO DEL OBJETO DECODIFICADO ----------
export type SmsDecoded = {
  id: string;
  op: "S" | "E" | "N" | "I";
  rol?: string;          // VICTIMA | RESCATISTA | FAMILIAR | CENTRO
  caso?: string;         // código (ATR, HER, ...)
  casoLegible?: string;  // "Víctima atrapada"
  descripcion?: string;
  lat?: number;
  lng?: number;
  ttl?: number;
  estado?: string;       // ABIERTA | EN_ATENCION | ...
};

// Forma flexible para encodeSms (acepta códigos o nombres largos).
export type SmsUpdate = {
  id: string;
  op: "S" | "E" | "N" | "I";
  rol?: string;          // "V" o "VICTIMA"
  caso?: string;         // "ATR"
  descripcion?: string;
  lat?: number;
  lng?: number;
  ttl?: number;
  estado?: string;       // "ATN" o "EN_ATENCION"
};

// ---------- generarId: 4 chars base36 ----------
export function generarId(): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += Math.floor(Math.random() * 36).toString(36);
  }
  return s;
}

// ---------- normalizarTel ----------
// Normaliza un teléfono a sus últimos 10 dígitos para comparar remitentes.
export function normalizarTel(tel: string): string {
  return (tel ?? "").replace(/\D/g, "").slice(-10);
}

// ---------- helpers internos ----------
function normRol(rol?: string): string | undefined {
  if (!rol) return undefined;
  const up = rol.toUpperCase();
  if (ROL_CODE[up]) return up;            // ya es código "V"
  if (CODE_ROL[up]) return CODE_ROL[up];  // nombre largo "VICTIMA"
  return undefined;
}
function normEstadoCode(estado?: string): string | undefined {
  if (!estado) return undefined;
  const up = estado.toUpperCase();
  if (ESTADO_CODE[up]) return up;            // ya es código "ATN"
  if (CODE_ESTADO[up]) return CODE_ESTADO[up]; // nombre largo "EN_ATENCION"
  return undefined;
}
function fmtCoord(n: number): string {
  // Hasta 5 decimales (~1m), sin ceros de cola, para ahorrar caracteres.
  return String(Number(n.toFixed(5)));
}

// ---------- ENCODE (lo usa la app para prellenar el SMS) ----------
export function encodeSms(u: SmsUpdate): string {
  const parts: string[] = [PREFIX, u.id, u.op];

  if (u.op === "E") {
    const code = normEstadoCode(u.estado);
    if (code) parts.push(code);
  } else {
    // S / N / I: rol caso descripcion
    const rolCode = normRol(u.rol);
    if (rolCode) parts.push(rolCode);
    if (u.caso) parts.push(u.caso.toUpperCase());
    if (u.descripcion) parts.push(u.descripcion);
  }

  if (u.lat != null && u.lng != null) {
    parts.push(`@${fmtCoord(u.lat)},${fmtCoord(u.lng)}`);
  }
  if (u.ttl != null) parts.push(`t${u.ttl}`);

  return parts.join(" ");
}

// ---------- DECODE (lo usa el ingest del servidor / la malla) ----------
export function decodeSms(text: string): SmsDecoded | null {
  const raw = (text ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return null;
  const t = raw.split(" ");

  // Rechaza lo que no empiece con el prefijo/versión RX1.
  if (t[0] !== PREFIX) return null;
  if (t.length < 3) return null;

  const id = t[1];
  const op = t[2].toUpperCase();
  if (op !== "S" && op !== "E" && op !== "N" && op !== "I") return null;

  // Tokens de cola opcionales: @lat,lng y tN (en cualquier orden al final).
  let lat: number | undefined;
  let lng: number | undefined;
  let ttl: number | undefined;
  const mid: string[] = [];
  for (let i = 3; i < t.length; i++) {
    const tok = t[i];
    if (tok.startsWith("@")) {
      const m = tok.slice(1).match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
      if (m) {
        lat = Number(m[1]);
        lng = Number(m[2]);
        continue;
      }
    }
    if (/^t\d+$/i.test(tok)) {
      ttl = Number(tok.slice(1));
      continue;
    }
    mid.push(tok);
  }

  const out: SmsDecoded = { id, op };
  if (lat != null) out.lat = lat;
  if (lng != null) out.lng = lng;
  if (ttl != null) out.ttl = ttl;

  if (op === "E") {
    const code = normEstadoCode(mid[0]);
    if (!code) return null;
    out.estado = ESTADO_CODE[code];
    return out;
  }

  // S / N / I
  let j = 0;
  const rolCode = normRol(mid[j]);
  if (rolCode) {
    out.rol = ROL_CODE[rolCode];
    j++;
  }
  const casoCode = (mid[j] ?? "").toUpperCase();
  if (casoCode && CASOS_VALIDOS.has(casoCode)) {
    out.caso = casoCode;
    out.casoLegible = CASO_LEGIBLE[casoCode];
    j++;
  }
  const descripcion = mid.slice(j).join(" ");
  if (descripcion) out.descripcion = descripcion;

  return out;
}

// ---------- decrementarTTL: tN -> tN-1, o null si llega a 0 ----------
// Recibe el SMS crudo; devuelve el mismo SMS con el TTL decrementado para
// reenviarlo en la malla, o null cuando ya no debe propagarse.
export function decrementarTTL(text: string): string | null {
  const raw = (text ?? "").trim().replace(/\s+/g, " ");
  const m = raw.match(/(^|\s)t(\d+)(\s|$)/i);
  if (!m) return null;                 // sin TTL: no se propaga en malla
  const n = Number(m[2]);
  if (n <= 1) return null;             // llega a 0: detener propagación
  return raw.replace(/(^|\s)t\d+(\s|$)/i, `$1t${n - 1}$2`).trim();
}
