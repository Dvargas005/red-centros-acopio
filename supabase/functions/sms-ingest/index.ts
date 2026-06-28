// =============================================================
//  Supabase Edge Function: sms-ingest
//  Recibe un SMS reenviado por un gateway (Android open-source o Twilio)
//  y aplica la actualizacion al centro del remitente.
//
//  Deploy:  supabase functions deploy sms-ingest --no-verify-jwt
//  Secrets: supabase secrets set SMS_INGEST_SECRET=... (ademas de los SUPABASE_* que ya existen)
//
//  Contrato (lo que el gateway debe POSTear):
//    POST /functions/v1/sms-ingest
//    Header:  x-ingest-secret: <SMS_INGEST_SECRET>
//    Body:    { "from": "+58412...", "text": "ACP 1 N AG 200 botellones" }
//
//  Seguridad: esta funcion usa el service_role (salta RLS), por eso DEBE
//  autorizar ella misma: solo aplica el cambio si el numero remitente
//  coincide con el telefono de un organizador registrado.
//  NOTA: el decoder aqui es copia de lib/sms-protocol.ts (Deno != Node, sin import cruzado).
// =============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CAT_CODE: Record<string, string> = {
  AL: "ALIMENTOS", AG: "AGUA", HI: "HIGIENE", BB: "BEBES", MD: "MEDICAMENTOS",
  RO: "ROPA", LI: "LIMPIEZA", HE: "HERRAMIENTAS", OT: "OTRO",
};
const ESTADOS = ["ACTIVO", "LLENO", "CERRADO"];

function normalizarTel(tel: string): string {
  return (tel ?? "").replace(/\D/g, "").slice(-10);
}

type Update =
  | { op: "NECESITA" | "SOBRA"; codigo?: string; categoria: string; cantidad?: number; descripcion?: string }
  | { op: "ESTADO"; codigo?: string; estado: string }
  | { op: "RESOLVER"; codigo?: string; tipo: "NECESITA" | "SOBRA"; categoria: string };

function decodeSms(text: string): { ok: true; update: Update } | { ok: false; reason: string } {
  const t = (text ?? "").trim().replace(/\s+/g, " ").split(" ");
  if (t.length < 3 || t[0].toUpperCase() !== "ACP") return { ok: false, reason: "no es ACP" };
  if (t[1] !== "1") return { ok: false, reason: "version no soportada" };
  let i = 2;
  const op = t[i++].toUpperCase();
  let codigo: string | undefined;
  if (t[i] && t[i].startsWith("@")) codigo = t[i++].slice(1);

  if (op === "N" || op === "S") {
    const categoria = CAT_CODE[(t[i++] ?? "").toUpperCase()];
    if (!categoria) return { ok: false, reason: "categoria invalida" };
    let cantidad: number | undefined;
    if (t[i] && /^\d+([.,]\d+)?$/.test(t[i])) cantidad = Number(t[i++].replace(",", "."));
    const descripcion = t.slice(i).join(" ") || undefined;
    return { ok: true, update: { op: op === "N" ? "NECESITA" : "SOBRA", codigo, categoria, cantidad, descripcion } };
  }
  if (op === "E") {
    const estado = (t[i++] ?? "").toUpperCase();
    if (!ESTADOS.includes(estado)) return { ok: false, reason: "estado invalido" };
    return { ok: true, update: { op: "ESTADO", codigo, estado } };
  }
  if (op === "R") {
    const tipo = t[i] === "N" || t[i]?.toUpperCase() === "N" ? "NECESITA"
      : t[i]?.toUpperCase() === "S" ? "SOBRA" : null;
    i++;
    if (!tipo) return { ok: false, reason: "tipo invalido" };
    const categoria = CAT_CODE[(t[i++] ?? "").toUpperCase()];
    if (!categoria) return { ok: false, reason: "categoria invalida" };
    return { ok: true, update: { op: "RESOLVER", codigo, tipo, categoria } };
  }
  return { ok: false, reason: "operacion desconocida" };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // 1) Autenticar al gateway con un secreto compartido.
  const secret = Deno.env.get("SMS_INGEST_SECRET");
  if (!secret || req.headers.get("x-ingest-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  // 2) Leer y decodificar el SMS.
  const { from, text } = await req.json().catch(() => ({ from: "", text: "" }));
  const decoded = decodeSms(text);
  if (!decoded.ok) return Response.json({ ok: false, ignored: true, reason: decoded.reason }, { status: 200 });
  const u = decoded.update;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 3) Autorizar: el remitente debe ser organizador de algun centro.
  const tel = normalizarTel(from);
  const { data: centros } = await supabase
    .from("centros")
    .select("id, organizador_telefono")
    .eq("estado", "ACTIVO");
  const propios = (centros ?? []).filter((c) => normalizarTel(c.organizador_telefono) === tel);
  if (propios.length === 0) {
    return Response.json({ ok: false, reason: "remitente no autorizado" }, { status: 403 });
  }
  // Si gestiona varios y no hay codigo, usa el primero (v1). Con codigo, ver roadmap (columna centros.codigo).
  const centro = propios[0];

  // 4) Aplicar.
  try {
    if (u.op === "NECESITA" || u.op === "SOBRA") {
      await supabase.from("items_centro").insert({
        centro_id: centro.id, tipo: u.op, categoria: u.categoria,
        descripcion: u.descripcion ?? u.categoria, cantidad: u.cantidad ?? null,
      });
    } else if (u.op === "ESTADO") {
      await supabase.from("centros").update({ estado: u.estado, actualizado_en: new Date().toISOString() }).eq("id", centro.id);
    } else if (u.op === "RESOLVER") {
      await supabase.from("items_centro").update({ resuelto: true })
        .eq("centro_id", centro.id).eq("tipo", u.tipo).eq("categoria", u.categoria).eq("resuelto", false);
    }
    return Response.json({ ok: true, applied: u, centro_id: centro.id });
  } catch (e) {
    return Response.json({ ok: false, reason: String(e) }, { status: 500 });
  }
});
