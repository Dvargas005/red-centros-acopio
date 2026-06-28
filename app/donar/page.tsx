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

export default function DonarPage() {
  const [categoria, setCategoria] = useState<Categoria | "">("");
  const [descripcion, setDescripcion] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [centros, setCentros] = useState<Centro[] | null>(null);
  const [estado, setEstado] = useState<"idle" | "ubicando" | "buscando" | "offline" | "error">("idle");

  function ubicar() {
    setEstado("ubicando");
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setEstado("idle"); },
      () => setEstado("error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function buscar() {
    if (!coords || !categoria || !descripcion.trim()) return;
    // Registrar la intención de donación (no bloquea la búsqueda).
    const donacion = {
      es_empresa: false, categoria, descripcion: descripcion.trim(),
      lat: coords.lat, lng: coords.lng,
    };

    if (!navigator.onLine) {
      enqueue("donaciones", donacion);
      setEstado("offline");
      return;
    }

    setEstado("buscando");
    try {
      await supabase.from("donaciones").insert(donacion);
      const { data, error } = await supabase.rpc("centros_cercanos", {
        p_lat: coords.lat, p_lng: coords.lng, p_limit: 8,
      });
      if (error) throw error;
      setCentros((data as Centro[]) ?? []);
      setEstado("idle");
    } catch {
      setEstado("error");
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
      <h1 className="text-xl font-bold">Quiero donar</h1>
      <p className="text-sm text-white/60">
        Tus datos de contacto no se publican. Solo te mostramos a dónde llevar la ayuda.
      </p>

      <div className="space-y-3">
        <div>
          <label className="label">¿Qué quieres donar?</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIAS.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoria(cat)}
                className={`chip ${categoria === cat ? "bg-accent text-black border-accent" : "text-white/70"}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Detalle</label>
          <input
            className="input"
            placeholder="Ej: 12 botellones de agua, 3 cajas de pañales talla 3"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Tu ubicación</label>
          {coords ? (
            <p className="text-sm text-ok">Ubicación lista ✓</p>
          ) : (
            <button className="btn-ghost w-full" onClick={ubicar}>
              {estado === "ubicando" ? "Ubicando…" : "Usar mi ubicación actual"}
            </button>
          )}
        </div>

        <button
          className="btn-accent w-full disabled:opacity-40"
          disabled={!coords || !categoria || !descripcion.trim() || estado === "buscando"}
          onClick={buscar}
        >
          {estado === "buscando" ? "Buscando centros…" : "Buscar centros cercanos"}
        </button>

        {estado === "offline" && (
          <p className="text-sm text-warn">
            Sin conexión. Guardamos tu donación y se enviará cuando vuelva la red.
            Mientras tanto, comparte por WhatsApp con un coordinador.
          </p>
        )}
        {estado === "error" && (
          <p className="text-sm text-danger">No se pudo completar. Revisa permisos de ubicación o tu conexión.</p>
        )}
      </div>

      {centros && (
        <section className="space-y-3 pt-2">
          <h2 className="font-semibold">
            {centros.length ? "Centros más cercanos" : "No hay centros activos cerca todavía"}
          </h2>
          {centros.map((c) => <CentroCard key={c.id} c={c} />)}
        </section>
      )}
    </div>
  );
}
