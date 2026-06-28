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

  // Estado de la cuenta para la sección opcional de vincular correo.
  const [esAnonimo, setEsAnonimo] = useState(false);
  const [tieneEmail, setTieneEmail] = useState(false);
  const [vincEmail, setVincEmail] = useState("");
  const [vinculando, setVinculando] = useState(false);
  const [vincEnviado, setVincEnviado] = useState(false);
  const [vincError, setVincError] = useState<string | null>(null);

  useEffect(() => {
    // 1) Carga inmediata desde cache (funciona offline).
    const { grupo: g, miembros: m } = leerGrupoActivo();
    setGrupo(g);
    setMiembros(m);
    setCargado(true);

    if (!supabaseConfigured) return;

    // 2) Lee la cuenta actual (anónima / con correo) y, si hay datos, refresca
    //    miembros desde Supabase.
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      setEsAnonimo(user.is_anonymous === true);
      setTieneEmail(!!user.email);

      if (g) {
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
      }
    });
  }, []);

  // Vincula un correo a la cuenta anónima para recuperar el acceso en otro
  // dispositivo. Supabase envía un enlace de confirmación al correo indicado.
  async function vincularCorreo() {
    setVincError(null);
    const email = vincEmail.trim();
    if (!email) return;
    setVinculando(true);
    try {
      const redirectTo =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== "undefined" ? window.location.origin : undefined);
      const { error } = await supabase.auth.updateUser(
        { email },
        { emailRedirectTo: redirectTo }
      );
      if (error) throw error;
      setVincEnviado(true);
    } catch (e) {
      setVincError(e instanceof Error ? e.message : "No se pudo vincular el correo.");
    } finally {
      setVinculando(false);
    }
  }

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

      <Link href="/alertas/nueva" className="btn bg-danger text-white w-full text-lg py-5 font-bold">
        🆘 SOS — Enviar alerta
      </Link>
      <Link href="/leer" className="btn-ghost w-full">📥 Leer una alerta recibida</Link>

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

      {/* Vincular correo: solo si la sesión es anónima y aún sin correo. */}
      {esAnonimo && !tieneEmail && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Proteger mi acceso (opcional)</h2>
          <p className="text-sm text-white/60">
            Vincula un correo para recuperar tu acceso a este grupo desde otro
            dispositivo. No es obligatorio para seguir usando la app aquí.
          </p>
          {vincEnviado ? (
            <p className="text-sm text-ok">
              Te enviamos un enlace de confirmación a tu correo. Ábrelo para
              terminar de vincularlo.
            </p>
          ) : (
            <>
              <input className="input" type="email" placeholder="tu@correo.com"
                value={vincEmail} onChange={(e) => setVincEmail(e.target.value)} />
              <button className="btn-ghost w-full disabled:opacity-40"
                disabled={!vincEmail.trim() || vinculando} onClick={vincularCorreo}>
                {vinculando ? "Enviando…" : "Vincular correo"}
              </button>
              {vincError && <p className="text-sm text-danger">{vincError}</p>}
            </>
          )}
        </div>
      )}

      <button className="btn-ghost w-full" onClick={salir}>
        Salir del grupo activo (solo en este dispositivo)
      </button>
    </div>
  );
}
