"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import MagicLogin from "@/components/MagicLogin";

export default function CrearCentroPage() {
  const [sesion, setSesion] = useState<boolean | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: "", organizador_nombre: "", organizador_telefono: "",
    direccion: "", ciudad: "", estado_geo: "", horario: "",
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok" | "error">("idle");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(!!data.session); setUid(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSesion(!!s); setUid(s?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  function ubicar() {
    navigator.geolocation.getCurrentPosition(
      (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setEstado("error")
    );
  }

  async function guardar() {
    if (!uid || !coords) return;
    setEstado("guardando");
    // Asegura el perfil del organizador (upsert) antes de crear el centro.
    await supabase.from("perfiles").upsert({
      id: uid, nombre: form.organizador_nombre, telefono: form.organizador_telefono, rol: "ORGANIZADOR",
    });
    const { error } = await supabase.from("centros").insert({
      nombre: form.nombre,
      organizador_id: uid,
      organizador_nombre: form.organizador_nombre,
      organizador_telefono: form.organizador_telefono,
      direccion: form.direccion, ciudad: form.ciudad, estado_geo: form.estado_geo,
      lat: coords.lat, lng: coords.lng,
      horario: form.horario ? [{ texto: form.horario }] : null,
    });
    setEstado(error ? "error" : "ok");
  }

  if (sesion === null) return <p className="text-white/50">Cargando…</p>;

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
      <h1 className="text-xl font-bold">Crear centro de acopio</h1>

      {!sesion ? (
        <MagicLogin titulo="Identifícate como organizador" />
      ) : estado === "ok" ? (
        <div className="card space-y-2">
          <p className="text-ok font-semibold">Centro registrado ✓</p>
          <p className="text-sm text-white/60">Ya es visible para donantes y voluntarios cercanos.</p>
          <Link href="/apoyar" className="btn-ghost text-sm">Ver la red de centros</Link>
        </div>
      ) : (
        <div className="space-y-3">
          <div><label className="label">Nombre del centro</label><input className="input" value={form.nombre} onChange={set("nombre")} /></div>
          <div><label className="label">Tu nombre (organizador)</label><input className="input" value={form.organizador_nombre} onChange={set("organizador_nombre")} /></div>
          <div><label className="label">Teléfono / WhatsApp</label><input className="input" value={form.organizador_telefono} onChange={set("organizador_telefono")} placeholder="+58…" /></div>
          <div><label className="label">Dirección</label><input className="input" value={form.direccion} onChange={set("direccion")} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Ciudad</label><input className="input" value={form.ciudad} onChange={set("ciudad")} /></div>
            <div><label className="label">Estado</label><input className="input" value={form.estado_geo} onChange={set("estado_geo")} placeholder="La Guaira" /></div>
          </div>
          <div><label className="label">Horario</label><input className="input" value={form.horario} onChange={set("horario")} placeholder="Lun-Dom 7:00-19:00" /></div>
          <div>
            <label className="label">Ubicación exacta del centro</label>
            {coords ? <p className="text-sm text-ok">Ubicación lista ✓</p> :
              <button className="btn-ghost w-full" onClick={ubicar}>Marcar con mi ubicación actual</button>}
          </div>
          <button className="btn-accent w-full disabled:opacity-40"
            disabled={!form.nombre || !form.organizador_nombre || !form.organizador_telefono || !form.direccion || !coords || estado === "guardando"}
            onClick={guardar}>{estado === "guardando" ? "Guardando…" : "Registrar centro"}</button>
          {estado === "error" && <p className="text-sm text-danger">No se pudo guardar. Revisa los datos y la conexión.</p>}
        </div>
      )}
    </div>
  );
}
