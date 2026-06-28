"use client";
import { useState } from "react";
import Link from "next/link";
import { CATEGORIAS, type Categoria } from "@/lib/supabase";
import { encodeSms } from "@/lib/sms-protocol";

// Numero de ingesta (el del gateway Android/Twilio). Se configura por env.
const INGEST = process.env.NEXT_PUBLIC_SMS_INGEST_NUMBER ?? "";

export default function ActualizarPage() {
  const [tipo, setTipo] = useState<"NECESITA" | "SOBRA">("NECESITA");
  const [categoria, setCategoria] = useState<Categoria | "">("");
  const [cantidad, setCantidad] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [copiado, setCopiado] = useState(false);

  const sms = categoria
    ? encodeSms({
        op: tipo, categoria,
        cantidad: cantidad ? Number(cantidad) : undefined,
        descripcion: descripcion || undefined,
      })
    : "";

  const smsLink = INGEST
    ? `sms:${INGEST}?body=${encodeURIComponent(sms)}`
    : `sms:?body=${encodeURIComponent(sms)}`;

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
      <h1 className="text-xl font-bold">Actualizar mi centro por SMS</h1>
      <p className="text-sm text-white/60">
        Sin datos pero con señal de SMS: compón el cambio y envíalo como texto. Lo recibimos y lo aplicamos.
      </p>

      <div className="flex gap-2">
        {(["NECESITA", "SOBRA"] as const).map((tp) => (
          <button key={tp} onClick={() => setTipo(tp)}
            className={`chip ${tipo === tp ? "bg-accent text-black border-accent" : "text-white/70"}`}>
            {tp === "NECESITA" ? "Necesito" : "Me sobra"}
          </button>
        ))}
      </div>

      <div>
        <label className="label">Categoría</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS.map((cat) => (
            <button key={cat} onClick={() => setCategoria(cat)}
              className={`chip ${categoria === cat ? "bg-accent text-black border-accent" : "text-white/70"}`}>{cat}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1"><label className="label">Cantidad</label>
          <input className="input" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></div>
        <div className="col-span-2"><label className="label">Detalle</label>
          <input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="botellones" /></div>
      </div>

      {sms && (
        <div className="card space-y-3">
          <div>
            <p className="label">Mensaje a enviar ({sms.length}/160)</p>
            <code className="block bg-base border border-line rounded-lg p-3 text-sm break-words">{sms}</code>
          </div>
          <div className="flex flex-col gap-2">
            <a href={smsLink} className="btn-accent w-full">Abrir SMS listo para enviar</a>
            <button className="btn-ghost w-full" onClick={() => { navigator.clipboard?.writeText(sms); setCopiado(true); }}>
              {copiado ? "Copiado ✓" : "Copiar texto"}
            </button>
          </div>
          {!INGEST && (
            <p className="text-xs text-warn">
              Configura <code>NEXT_PUBLIC_SMS_INGEST_NUMBER</code> para que el SMS se dirija solo al número de ingesta.
            </p>
          )}
          <p className="text-xs text-white/50">
            El cambio se aplica solo si envías desde el teléfono registrado como organizador del centro.
          </p>
        </div>
      )}
    </div>
  );
}
