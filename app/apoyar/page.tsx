"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import MagicLogin from "@/components/MagicLogin";

type CentroAuth = {
  id: string; nombre: string; direccion: string; ciudad: string | null;
  estado_geo: string | null; organizador_nombre: string; organizador_telefono: string;
};

export default function ApoyarPage() {
  const [sesion, setSesion] = useState<boolean | null>(null);
  const [centros, setCentros] = useState<CentroAuth[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSesion(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sesion) return;
    // Centros activos: como autenticado, RLS permite ver el telefono del organizador.
    supabase
      .from("centros")
      .select("id,nombre,direccion,ciudad,estado_geo,organizador_nombre,organizador_telefono")
      .eq("estado", "ACTIVO")
      .then(({ data }) => setCentros((data as CentroAuth[]) ?? []));
  }, [sesion]);

  if (sesion === null) return <p className="text-white/50">Cargando…</p>;

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
      <h1 className="text-xl font-bold">Quiero apoyar</h1>

      {!sesion ? (
        <MagicLogin titulo="Identifícate como voluntario" />
      ) : (
        <section className="space-y-3">
          <p className="text-sm text-white/60">Centros que necesitan manos. Contacta al organizador para coordinar.</p>
          {centros.map((c) => (
            <div key={c.id} className="card space-y-1">
              <h3 className="font-semibold">{c.nombre}</h3>
              <p className="text-sm text-white/60">{c.direccion}{c.ciudad ? `, ${c.ciudad}` : ""}</p>
              <p className="text-sm">Organizador: {c.organizador_nombre}</p>
              <a className="btn-ghost text-sm mt-1"
                href={`https://wa.me/${c.organizador_telefono.replace(/[^0-9]/g, "")}`}
                target="_blank" rel="noreferrer">
                WhatsApp: {c.organizador_telefono}
              </a>
            </div>
          ))}
          {!centros.length && <p className="text-white/50 text-sm">No hay centros activos por ahora.</p>}
        </section>
      )}
    </div>
  );
}
