// =============================================================
//  Protocolo SMS compacto v1  —  actualizaciones de centro por texto
//  Diseñado para caber en 1 segmento SMS (<=160 chars) y ser legible/tecleable.
//  Decodifica a un objeto plano (la "especie de JSON" que se pidió).
//
//  Formato:  ACP <ver> <op> [@CODIGO] <args...>
//    op  N = necesita | S = sobra | E = estado centro | R = resolver item
//    cat AL AG HI BB MD RO LI HE OT
//
//  Ejemplos:
//    ACP 1 N AG 200 botellones        -> el centro del remitente NECESITA 200 botellones de AGUA
//    ACP 1 S AL 30 cajas de atun      -> SOBRAN 30 cajas (ALIMENTOS): "cajas de atun"
//    ACP 1 E LLENO                    -> estado del centro = LLENO
//    ACP 1 R N AG                     -> marca como resuelta la NECESIDAD de AGUA
//    ACP 1 N @LG12 MD 50 cajas        -> usa el centro con codigo LG12 (si el remitente gestiona varios)
// =============================================================

export const CAT_CODE: Record<string, string> = {
  AL: "ALIMENTOS", AG: "AGUA", HI: "HIGIENE", BB: "BEBES", MD: "MEDICAMENTOS",
  RO: "ROPA", LI: "LIMPIEZA", HE: "HERRAMIENTAS", OT: "OTRO",
};
export const CODE_CAT: Record<string, string> = Object.fromEntries(
  Object.entries(CAT_CODE).map(([k, v]) => [v, k])
);
const ESTADOS = ["ACTIVO", "LLENO", "CERRADO"] as const;

export type SmsUpdate =
  | { op: "NECESITA" | "SOBRA"; codigo?: string; categoria: string; cantidad?: number; unidad?: string; descripcion?: string }
  | { op: "ESTADO"; codigo?: string; estado: (typeof ESTADOS)[number] }
  | { op: "RESOLVER"; codigo?: string; tipo: "NECESITA" | "SOBRA"; categoria: string };

const PREFIX = "ACP";
const VER = "1";

// ---------- ENCODE (lo usa la app para prellenar el SMS) ----------
export function encodeSms(u: SmsUpdate): string {
  const code = u.codigo ? `@${u.codigo} ` : "";
  switch (u.op) {
    case "NECESITA":
    case "SOBRA": {
      const opc = u.op === "NECESITA" ? "N" : "S";
      const cat = CODE_CAT[u.categoria] ?? "OT";
      const qty = u.cantidad != null ? ` ${u.cantidad}` : "";
      const desc = u.descripcion ? ` ${u.descripcion}` : "";
      return `${PREFIX} ${VER} ${opc} ${code}${cat}${qty}${desc}`.trim();
    }
    case "ESTADO":
      return `${PREFIX} ${VER} E ${code}${u.estado}`.trim();
    case "RESOLVER": {
      const opc = u.tipo === "NECESITA" ? "N" : "S";
      return `${PREFIX} ${VER} R ${code}${opc} ${CODE_CAT[u.categoria] ?? "OT"}`.trim();
    }
  }
}

// ---------- DECODE (lo usa el ingest del servidor) ----------
export function decodeSms(text: string): { ok: true; update: SmsUpdate } | { ok: false; reason: string } {
  const raw = (text ?? "").trim().replace(/\s+/g, " ");
  const t = raw.split(" ");
  if (t.length < 3 || t[0].toUpperCase() !== PREFIX) return { ok: false, reason: "no es un mensaje ACP" };
  if (t[1] !== VER) return { ok: false, reason: `version no soportada: ${t[1]}` };

  let i = 2;
  const op = t[i++].toUpperCase();

  // codigo opcional @XXXX
  let codigo: string | undefined;
  if (t[i] && t[i].startsWith("@")) codigo = t[i++].slice(1);

  if (op === "N" || op === "S") {
    const catCode = (t[i++] ?? "").toUpperCase();
    const categoria = CAT_CODE[catCode];
    if (!categoria) return { ok: false, reason: `categoria invalida: ${catCode}` };
    let cantidad: number | undefined;
    if (t[i] && /^\d+([.,]\d+)?$/.test(t[i])) cantidad = Number(t[i++].replace(",", "."));
    const descripcion = t.slice(i).join(" ") || undefined;
    return { ok: true, update: { op: op === "N" ? "NECESITA" : "SOBRA", codigo, categoria, cantidad, descripcion } };
  }

  if (op === "E") {
    const estado = (t[i++] ?? "").toUpperCase() as (typeof ESTADOS)[number];
    if (!ESTADOS.includes(estado)) return { ok: false, reason: `estado invalido: ${estado}` };
    return { ok: true, update: { op: "ESTADO", codigo, estado } };
  }

  if (op === "R") {
    const tipoCode = (t[i++] ?? "").toUpperCase();
    const tipo = tipoCode === "N" ? "NECESITA" : tipoCode === "S" ? "SOBRA" : null;
    if (!tipo) return { ok: false, reason: `tipo invalido para R: ${tipoCode}` };
    const categoria = CAT_CODE[(t[i++] ?? "").toUpperCase()];
    if (!categoria) return { ok: false, reason: "categoria invalida en R" };
    return { ok: true, update: { op: "RESOLVER", codigo, tipo, categoria } };
  }

  return { ok: false, reason: `operacion desconocida: ${op}` };
}

// Util: normaliza un telefono a sus ultimos 10 digitos para comparar remitentes.
export function normalizarTel(tel: string): string {
  return (tel ?? "").replace(/\D/g, "").slice(-10);
}
