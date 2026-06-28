"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import {
  leerGrupoActivo, guardarGrupoActivo, limpiarGrupoActivo,
  type GrupoActivo, type Miembro,
} from "@/lib/cache";

const TIPO_LABEL: Record<string, string> = {
  FAMILIA_VECINOS: "Familia / Vecinos",
  RESCATE: "Rescate",
};

export default function MiGrupoPage() {
  const router = useRouter();
  const [grupo, setGrupo] = useState<GrupoActivo | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [copiado, setCopiado] = useState(false);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    // 1) Carga inmediata desde cache (funciona offline).
    const { grupo: g, miembros: m } = leerGrupoActivo();
    setGrupo(g);
    setMiembros(m);
    setCargado(true);

    // 2) Si hay sesión y datos, refresca miembros desde Supabase.
    if (g && supabaseConfigured) {
      supabase.auth.getUser().then(({ data }) => {
        if (!data.user) return;
        supabase
          .from("grupo_miembros")
          .select("perfil_id, nombre, telefono")
          .eq("grupo_id", g.id)
          .then(({ data: filas }) => {
            if (filas && filas.length) {
              const frescos = filas as Miembro[];
              setMiembros(frescos);
              guardarGrupoActivo(g, frescos);
            }
          });
      });
    }
  }, []);

  function copiar() {
    if (!grupo) return;
    navigator.clipboard?.writeText(grupo.codigo);
    setCopiado(true);
  }

  function salir() {
    limpiarGrupoActivo();
    router.push("/");
  }

  // ----- Sin grupo activo -----
  if (cargado && !grupo) {
    return (
      <div className="space-y-5">
        <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
        <h1 className="text-xl font-bold">Mi grupo</h1>
        <div className="card space-y-3">
          <p className="text-sm text-white/60">No tienes un grupo activo en este dispositivo.</p>
          <Link href="/grupos/crear" className="btn-accent w-full">Crear grupo</Link>
          <Link href="/grupos/unirse" className="btn-ghost w-full">Unirme a un grupo</Link>
        </div>
      </div>
    );
  }

  if (!grupo) return null;

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>

      <header className="space-y-1">
        <h1 className="text-xl font-bold">{grupo.nombre}</h1>
        <p className="text-sm text-white/60">{TIPO_LABEL[grupo.tipo] ?? grupo.tipo}</p>
      </header>

      <div className="card flex items-center justify-between gap-3">
        <div>
          <p className="label mb-0">Código del grupo</p>
          <p className="text-2xl font-bold tracking-[0.3em] text-accent">{grupo.codigo}</p>
        </div>
        <button className="btn-ghost" onClick={copiar}>
          {copiado ? "Copiado ✓" : "Copiar"}
        </button>
      </div>

      <div>
        <p className="label">Miembros ({miembros.length})</p>
        <div className="grid gap-2">
          {miembros.length === 0 && (
            <p className="text-sm text-white/50">Aún no hay miembros guardados.</p>
          )}
          {miembros.map((m, i) => (
            <div key={m.perfil_id ?? i} className="card py-3">
              <p className="font-medium">{m.nombre || "Sin nombre"}</p>
              {m.telefono && <p className="text-sm text-white/60">{m.telefono}</p>}
            </div>
          ))}
        </div>
      </div>

      <button className="btn-ghost w-full" onClick={salir}>
        Salir del grupo activo (solo en este dispositivo)
      </button>
    </div>
  );
}
