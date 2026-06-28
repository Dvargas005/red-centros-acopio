"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import {
  leerGrupoActivo, guardarGrupoActivo, limpiarGrupoActivo,
  leerAlertasLocales, guardarAlertaLocal,
  leerUltimaVistaTablero, guardarUltimaVistaTablero,
  type GrupoActivo, type Miembro,
} from "@/lib/cache";
import {
  fetchAlertasGrupo, haceCuanto, hayConexion, type Alerta,
} from "@/lib/alertas";

const TIPO_LABEL: Record<string, string> = {
  FAMILIA_VECINOS: "Familia / Vecinos",
  RESCATE: "Rescate",
};

// Timestamp más reciente (subido_en o creado_en) de una lista de alertas.
function ultimaActividad(list: Alerta[]): string | null {
  let max: string | null = null;
  for (const a of list) {
    const t = a.subido_en || a.creado_en;
    if (t && (!max || t > max)) max = t;
  }
  return max;
}

export default function MiGrupoPage() {
  const router = useRouter();
  const [grupo, setGrupo] = useState<GrupoActivo | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [copiado, setCopiado] = useState(false);
  const [cargado, setCargado] = useState(false);

  // Tablero de alertas + notificación de actividad nueva (MSG-004 / MSG-005).
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [notif, setNotif] = useState<string | null>(null);

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
    if (g) setAlertas(leerAlertasLocales(g.id));
    setCargado(true);

    if (!supabaseConfigured) return;

    // 2) Lee la cuenta actual (anónima / con correo) y, si hay datos, refresca
    //    miembros y alertas desde Supabase.
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      setEsAnonimo(user.is_anonymous === true);
      setTieneEmail(!!user.email);
      if (g) refrescarAlertas(g);

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

  // Trae las alertas del grupo desde la nube, las cachea y calcula si hay
  // actividad nueva desde la última visita (notificación con timestamp).
  async function refrescarAlertas(g: GrupoActivo) {
    if (!supabaseConfigured || !hayConexion()) return;
    const nube = await fetchAlertasGrupo(g.id);
    if (!nube.length) return;
    nube.forEach((a) => guardarAlertaLocal(a));
    setAlertas(nube);

    const max = ultimaActividad(nube);
    const prev = leerUltimaVistaTablero(g.id);
    if (prev && max && max > prev) {
      setNotif(`Nueva actividad en el grupo · ${haceCuanto(max)}`);
    }
    if (max) guardarUltimaVistaTablero(g.id, max);
  }

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

      {notif && (
        <div className="card border-accent">
          <p className="text-sm text-accent">🔔 {notif}</p>
        </div>
      )}

      <Link href="/alertas/nueva" className="btn bg-danger text-white w-full text-lg py-5 font-bold">
        🆘 SOS — Enviar alerta
      </Link>
      <Link href="/leer" className="btn-ghost w-full">📥 Leer una alerta recibida</Link>

      {/* Tablero de alertas (se enriquece con estados/acciones en MSG-004). */}
      <div>
        <p className="label">Alertas del grupo ({alertas.length})</p>
        <div className="grid gap-2">
          {alertas.length === 0 && (
            <p className="text-sm text-white/50">Sin alertas registradas en este dispositivo.</p>
          )}
          {alertas.map((a, i) => (
            <div key={a.id ?? a.codigo_corto ?? i} className="card py-3">
              <p className="font-medium">{a.estado}</p>
              {a.descripcion && <p className="text-sm text-white/60">{a.descripcion}</p>}
              <p className="text-xs text-white/40">{haceCuanto(a.subido_en || a.creado_en)}</p>
            </div>
          ))}
        </div>
      </div>

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
