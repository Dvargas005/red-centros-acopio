// =============================================================
//  Protocolo de Mensajería de Emergencia v3 — SMS LEGIBLE PLANO
//
//  Cambio clave frente a v2 (RX1 cifrado): el SMS que se compone ahora es
//  TEXTO HUMANO-LEGIBLE en todos los casos (familia, vecinos, rescate). Un
//  vecino que reciba el mensaje lo entiende SIN la app.
//
//  Formato (segmentos separados por " - "):
//    <PREFIJO> - <Nombre> - <MENSAJE> - [nota] - [mapa] - [<id> #COD tN g:Grupo]
//
//    PREFIJO  -> "SOS" (auxilio) | "AVISO" (mensaje normal) | "ACTUALIZACION" (cambio de estado)
//    Nombre   -> nombre legible del emisor (o "Alguien" si no se conoce)
//    MENSAJE  -> texto del catálogo, p.ej. "ATRAPADO" / "ESTOY A SALVO"
//    nota     -> texto libre opcional ("piso 4")
//    mapa     -> https://maps.google.com/?q=LAT,LNG (opcional)
//    [...]    -> corchete machine-readable al final: identificador corto para
//                de-dup + códigos para que decodeSms reconstruya el caso/estado.
//
//  Ejemplos:
//    SOS - Juan - ATRAPADO - piso 4 - https://maps.google.com/?q=10.601,-66.934 - [7g2k #ATR t3 g:Familia Perez]
//    AVISO - Ana - ESTOY A SALVO - [9a1z #SAL g:Familia Perez]
//    ACTUALIZACION - Luis - RESUELTA - [7g2k e:RES g:Familia Perez]
//
//  El cuerpo es para humanos; el corchete es para la app. decodeSms entiende
//  lo que generamos y es CASE-INSENSITIVE (acepta el corchete en cualquier
//  caja). Conserva compatibilidad de presentación vía CASO_LEGIBLE.
// =============================================================

import { MENSAJES } from "./catalogo";

const SEP = " - ";

// ---------- ROLES (legado, conservado para compatibilidad) ----------
// El catálogo nuevo es por tipo de grupo (no por rol). Estos mapas quedan
// para no romper imports antiguos (lib/alertas.ts) y datos viejos.
export const ROL_CODE: Record<string, string> = {
  V: "VICTIMA", R: "RESCATISTA", F: "FAMILIAR", C: "CENTRO",
};
export const CODE_ROL: Record<string, string> = Object.fromEntries(
  Object.entries(ROL_CODE).map(([k, v]) => [v, k])
);

// ---------- CASO_LEGIBLE: code -> texto legible (desde el catálogo) ----------
export const CASO_LEGIBLE: Record<string, string> = Object.fromEntries(
  Object.values(MENSAJES).map((m) => [m.code, m.texto])
);
// Reverso texto(normalizado) -> code, para recuperar el caso si faltara en el
// corchete (best-effort en decode).
const TEXTO_A_CODE: Record<string, string> = Object.fromEntries(
  Object.values(MENSAJES).map((m) => [m.texto.toUpperCase(), m.code])
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
// Etiqueta legible corta por código de estado (para el cuerpo del SMS).
const ESTADO_LEGIBLE: Record<string, string> = {
  ABI: "Abierta",
  ATN: "En atención",
  RES: "Resuelta",
  CAN: "Cancelada",
  FAL: "Falsa alarma",
};

// ---------- TIPO DEL OBJETO DECODIFICADO ----------
export type SmsDecoded = {
  id: string;
  op: "S" | "E";
  rol?: string;          // legado; normalmente vacío en v3
  caso?: string;         // código de catálogo (ATR, SAL, ...)
  casoLegible?: string;  // "Atrapado"
  descripcion?: string;
  emisorNombre?: string; // nombre legible del emisor, si venía en el cuerpo
  lat?: number;
  lng?: number;
  ttl?: number;
  estado?: string;       // ABIERTA | EN_ATENCION | ...
};

// Forma flexible para encodeSms.
export type SmsUpdate = {
  id: string;
  op: "S" | "E" | "N" | "I";
  caso?: string;         // código de catálogo
  descripcion?: string;
  nombre?: string;       // nombre legible del emisor
  grupo?: string;        // nombre legible del grupo
  lat?: number;
  lng?: number;
  ttl?: number;
  estado?: string;       // "ATN" o "EN_ATENCION" (op E)
};

// ---------- generarId: 4 chars base36 (minúsculas) ----------
export function generarId(): string {
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += Math.floor(Math.random() * 36).toString(36);
  }
  return s.toLowerCase();
}

// ---------- normalizarTel: últimos 10 dígitos, para comparar remitentes ----------
export function normalizarTel(tel: string): string {
  return (tel ?? "").replace(/\D/g, "").slice(-10);
}

// ---------- normalizarTelVE: formato consistente para GUARDAR ----------
// No bloquea por formato: siempre devuelve algo razonable. Acepta el número
// con o sin 0 inicial y con o sin espacios/guiones; lo ajusta a +58... para
// Venezuela cuando puede inferirlo.
//   "0412 123 4567"  -> "+584121234567"
//   "412-1234567"    -> "+584121234567"
//   "+58 0412..."    -> "+58412..."  (quita el 0 tras el código de país)
//   "+1 305 ..."     -> respeta el código internacional dado
export function normalizarTelVE(raw: string): string {
  if (!raw) return "";
  let s = raw.replace(/[\s\-().]/g, ""); // quita espacios, guiones, paréntesis, puntos
  if (!s) return "";
  // 00 internacional -> +
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) {
    const d = s.slice(1).replace(/\D/g, "");
    // +<cod><0local> -> quita el 0 sobrante tras el código de país (caso VE: +580412)
    return "+" + d.replace(/^580/, "58");
  }
  const d = s.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("58")) return "+" + d.replace(/^580/, "58"); // 58... o 580... -> +58...
  if (d.startsWith("0")) return "+58" + d.slice(1);             // 0412... -> +58412...
  if (d.length >= 10) return "+58" + d;                         // 412xxxxxxx -> +58412xxxxxxx
  return "+" + d; // fallback: no es un patrón VE claro; deja los dígitos, no bloquea
}

// ---------- helpers internos ----------
function normEstadoCode(estado?: string): string | undefined {
  if (!estado) return undefined;
  const up = estado.toUpperCase();
  if (ESTADO_CODE[up]) return up;            // ya es código "ATN"
  if (CODE_ESTADO[up]) return CODE_ESTADO[up]; // nombre largo "EN_ATENCION"
  return undefined;
}
function fmtCoord(n: number): string {
  // Hasta 5 decimales (~1m), sin ceros de cola.
  return String(Number(n.toFixed(5)));
}
function mapsUrl(lat?: number, lng?: number): string | null {
  if (lat == null || lng == null) return null;
  return `https://maps.google.com/?q=${fmtCoord(lat)},${fmtCoord(lng)}`;
}
// Limpia un texto libre para que no rompa los separadores ni el corchete.
function limpiar(s: string): string {
  return s.replace(/\s+/g, " ").replace(/[[\]]/g, "").replace(/\s-\s/g, " · ").trim();
}
// Corchete machine-readable al final. g: va último porque el nombre de grupo
// puede llevar espacios (decode toma todo lo que sigue a "g:").
function corchete(id: string, o: { caso?: string; estado?: string; ttl?: number; grupo?: string }): string {
  const t = [id];
  if (o.caso) t.push("#" + o.caso.toUpperCase());
  if (o.estado) t.push("e:" + o.estado.toUpperCase());
  if (o.ttl != null) t.push("t" + o.ttl);
  if (o.grupo) t.push("g:" + limpiar(o.grupo));
  return "[" + t.join(" ") + "]";
}

// ---------- ENCODE: produce el SMS legible plano ----------
export function encodeSms(u: SmsUpdate): string {
  const nombre = (u.nombre && u.nombre.trim()) ? limpiar(u.nombre) : "Alguien";
  const maps = mapsUrl(u.lat, u.lng);

  if (u.op === "E") {
    const code = normEstadoCode(u.estado);
    const legible = code ? ESTADO_LEGIBLE[code] : "Actualización";
    const seg = ["ACTUALIZACION", nombre, legible.toUpperCase()];
    if (maps) seg.push(maps);
    seg.push(corchete(u.id, { estado: code, ttl: u.ttl, grupo: u.grupo }));
    return seg.join(SEP);
  }

  // S / N / I -> mensaje de catálogo.
  const code = u.caso ? u.caso.toUpperCase() : "";
  const msg = code ? MENSAJES[code] : undefined;
  const prefijo = msg?.sos ? "SOS" : "AVISO";
  let texto = msg?.texto ?? (u.caso ?? "Mensaje");
  let nota = (u.descripcion ?? "").trim();
  // "Reunámonos en [lugar]" -> sustituye el placeholder con la nota.
  if (msg?.pideLugar && nota) {
    texto = texto.replace("[lugar]", nota);
    nota = "";
  }

  const seg = [prefijo, nombre, texto.toUpperCase()];
  if (nota) seg.push(limpiar(nota));
  if (maps) seg.push(maps);
  seg.push(corchete(u.id, { caso: code || undefined, ttl: u.ttl, grupo: u.grupo }));
  return seg.join(SEP);
}

// ---------- DECODE: entiende lo que generamos (CASE-INSENSITIVE) ----------
export function decodeSms(text: string): SmsDecoded | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;

  // 1) Corchete final machine-readable: indispensable para de-dup/decode.
  const mBr = raw.match(/\[([^\]]*)\]/);
  if (!mBr) return null;
  const contenido = mBr[1].trim();
  if (!contenido) return null;

  // Separa el nombre de grupo (g:...) del resto: puede tener espacios.
  const gi = contenido.search(/\bg:/i);
  const cabeza = (gi >= 0 ? contenido.slice(0, gi) : contenido).trim();
  const toks = cabeza.split(/\s+/).filter(Boolean);
  if (toks.length === 0) return null;

  const id = toks[0].toLowerCase();
  let caso: string | undefined;
  let estado: string | undefined;
  let ttl: number | undefined;
  for (let i = 1; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.startsWith("#")) caso = tk.slice(1).toUpperCase();
    else if (/^e:/i.test(tk)) estado = normEstadoCode(tk.slice(2));
    else if (/^t\d+$/i.test(tk)) ttl = Number(tk.slice(1));
  }

  // 2) Coordenadas desde la URL de mapa (?q=LAT,LNG).
  let lat: number | undefined;
  let lng: number | undefined;
  const mGeo = raw.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (mGeo) {
    lat = Number(mGeo[1]);
    lng = Number(mGeo[2]);
  }

  // 3) Cuerpo legible: segmentos sin el de mapa ni el del corchete.
  const partes = raw.split(SEP).map((p) => p.trim());
  const cuerpo = partes.filter((p) => !p.includes("[") && !/https?:\/\//i.test(p));
  // cuerpo = [PREFIJO, Nombre, MENSAJE, ...nota]
  const emisorNombre = cuerpo[1] && cuerpo[1].toLowerCase() !== "alguien" ? cuerpo[1] : undefined;
  const textoMensaje = cuerpo[2];
  const nota = cuerpo.slice(3).join(SEP).trim();

  const out: SmsDecoded = {
    id,
    op: estado ? "E" : "S",
  };
  if (lat != null) out.lat = lat;
  if (lng != null) out.lng = lng;
  if (ttl != null) out.ttl = ttl;
  if (emisorNombre) out.emisorNombre = emisorNombre;

  if (estado) {
    out.estado = ESTADO_CODE[estado];
    return out;
  }

  // Caso: del corchete (#COD) o, si faltara, recuperado del texto legible.
  if (!caso && textoMensaje) caso = TEXTO_A_CODE[textoMensaje.toUpperCase()];
  if (caso) {
    out.caso = caso;
    out.casoLegible = CASO_LEGIBLE[caso];
  }
  if (nota) out.descripcion = nota;
  return out;
}

// ---------- decrementarTTL: tN -> tN-1, o null si llega a 0 ----------
// Busca el token tN (esté suelto o dentro del corchete) y lo decrementa para
// reenviarlo en cadena, o devuelve null cuando ya no debe propagarse.
export function decrementarTTL(text: string): string | null {
  const re = /(^|[\s[])t(\d+)(?=[\s\]]|$)/i;
  const m = (text ?? "").match(re);
  if (!m) return null;             // sin TTL: no se propaga en cadena
  const n = Number(m[2]);
  if (n <= 1) return null;         // llega a 0: detener propagación
  return text.replace(re, (_full, pre) => `${pre}t${n - 1}`);
}
