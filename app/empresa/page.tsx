"use client";
import { useState } from "react";
import Link from "next/link";
import { supabase, CATEGORIAS, type Categoria } from "@/lib/supabase";
import { enqueue } from "@/lib/offline";
import CentroCard from "@/components/CentroCard";

type Centro = {
  id: string; nombre: string; direccion: string;
  ciudad: string | null; estado_geo: string | null; distancia_km: number | null;
};

export default function EmpresaPage() {
  const [empresa, setEmpresa] = useState("");
  const [contacto, setContacto] = useState("");
  const [categoria, setCategoria] = useState<Categoria | "">("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [centros, setCentros] = useState<Centro[] | null>(null);
  const [estado, setEstado] = useState<"idle" | "ubicando" | "enviando" | "offline" | "error">("idle");

  function ubicar() {
    setEstado("ubicando");
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setEstado("idle"); },
      () => setEstado("error")
    );
  }

  async function enviar() {
    if (!empresa || !contacto || !categoria || !descripcion.trim() || !coords) return;
    const payload = {
      es_empresa: true, empresa, donante_contacto: contacto,
      categoria, descripcion: descripcion.trim(),
      cantidad: cantidad ? Number(cantidad) : null,
      lat: coords.lat, lng: coords.lng,
    };
    if (!navigator.onLine) { enqueue("donaciones", payload); setEstado("offline"); return; }
    setEstado("enviando");
    try {
      await supabase.from("donaciones").insert(payload);
      const { data } = await supabase.rpc("centros_cercanos", { p_lat: coords.lat, p_lng: coords.lng, p_limit: 6 });
      setCentros((data as Centro[]) ?? []);
      setEstado("idle");
    } catch { setEstado("error"); }
  }

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
      <h1 className="text-xl font-bold">Soy empresa</h1>
      <p className="text-sm text-white/60">Donación en volumen. Tu contacto solo lo ve el organizador del centro asignado.</p>

      <div className="space-y-3">
        <div><label className="label">Empresa</label><input className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)} /></div>
        <div><label className="label">Contacto (teléfono/WhatsApp)</label><input className="input" value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="+58…" /></div>
        <div>
          <label className="label">Categoría</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIAS.map((cat) => (
              <button key={cat} onClick={() => setCategoria(cat)}
                className={`chip ${categoria === cat ? "bg-accent text-black border-accent" : "text-white/70"}`}>{cat}</button>
            ))}
          </div>
        </div>
        <div><label className="label">Detalle</label><input className="input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: 2 paletas de agua embotellada" /></div>
        <div><label className="label">Cantidad aprox.</label><input className="input" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></div>
        <div>
          <label className="label">Ubicación de origen</label>
          {coords ? <p className="text-sm text-ok">Ubicación lista ✓</p> :
            <button className="btn-ghost w-full" onClick={ubicar}>{estado === "ubicando" ? "Ubicando…" : "Usar mi ubicación"}</button>}
        </div>
        <button className="btn-accent w-full disabled:opacity-40"
          disabled={!empresa || !contacto || !categoria || !descripcion.trim() || !coords || estado === "enviando"}
          onClick={enviar}>{estado === "enviando" ? "Enviando…" : "Coordinar donación"}</button>

        {estado === "offline" && <p className="text-sm text-warn">Sin conexión. Guardado; se enviará al reconectar.</p>}
        {estado === "error" && <p className="text-sm text-danger">No se pudo enviar. Revisa conexión/permisos.</p>}
      </div>

      {centros && (
        <section className="space-y-3 pt-2">
          <h2 className="font-semibold">Centros sugeridos para coordinar</h2>
          {centros.map((c) => <CentroCard key={c.id} c={c} />)}
        </section>
      )}
    </div>
  );
}
