"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { encodeSms } from "@/lib/sms-protocol";
import { TIPO_GRUPO_LABEL, normalizarTipo } from "@/lib/catalogo";
import {
  leerGrupoActivo, guardarGrupoActivo, limpiarGrupoActivo,
  leerAlertasLocales, guardarAlertaLocal, actualizarEstadoLocal,
  leerUltimaVistaTablero, guardarUltimaVistaTablero,
  type GrupoActivo, type Miembro,
} from "@/lib/cache";
import {
  fetchAlertasGrupo, fetchHistorial, cambiarEstado,
  describirAlerta, mapaUrl, haceCuanto, hayConexion, smsLink,
  ESTADO_BADGE, ESTADO_LABEL,
  type Alerta, type EstadoAlerta, type HistorialFila,
} from "@/lib/alertas";

// Acciones de estado disponibles desde una alerta.
const ACCIONES: { estado: EstadoAlerta; label: string }[] = [
  { estado: "EN_ATENCION", label: "Voy en camino" },
  { estado: "RESUELTA", label: "Resuelta" },
  { estado: "CANCELADA", label: "Cancelar" },
  { estado: "FALSA_ALARMA", label: "Falsa alarma" },
];

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
  const [userId, setUserId] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Record<string, HistorialFila[]>>({});
  const [difusion, setDifusion] = useState<{ codigo: string; sms: string } | null>(null);
  const [accionError, setAccionError] = useState<string | null>(null);

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
      setUserId(user.id);
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

  // Expandir/colapsar una alerta y, al expandir, traer su historial.
  async function alternarExpandir(a: Alerta) {
    const code = a.codigo_corto;
    if (expandida === code) { setExpandida(null); return; }
    setExpandida(code);
    if (a.id && supabaseConfigured && hayConexion() && !historial[code]) {
      const filas = await fetchHistorial(a.id);
      setHistorial((h) => ({ ...h, [code]: filas }));
    }
  }

  // Cambia el estado: actualiza local + nube e instala la difusión por SMS.
  async function cambiar(a: Alerta, estado: EstadoAlerta) {
    if (!grupo) return;
    setAccionError(null);

    // SMS de difusión legible: "ACTUALIZACION - <yo> - <ESTADO> - [<id> e:..]".
    const miNombre = miembros.find((m) => m.perfil_id && m.perfil_id === userId)?.nombre || "";
    const sms = encodeSms({
      id: a.codigo_corto, op: "E", estado,
      nombre: miNombre || undefined, grupo: grupo.nombre,
    });
    setDifusion({ codigo: a.codigo_corto, sms });

    // Local primero (funciona offline).
    actualizarEstadoLocal(grupo.id, a.codigo_corto, estado);
    setAlertas((prev) => prev.map((x) => (x.codigo_corto === a.codigo_corto ? { ...x, estado } : x)));

    // Nube + historial si hay datos y sesión.
    if (supabaseConfigured && hayConexion() && userId) {
      const r = await cambiarEstado(grupo.id, a.codigo_corto, estado, { emisor_id: userId });
      if (!r.ok) {
        setAccionError("No se pudo guardar el cambio en la nube; quedó local. Difúndelo por SMS.");
      } else if (r.id) {
        const filas = await fetchHistorial(r.id);
        setHistorial((h) => ({ ...h, [a.codigo_corto]: filas }));
      }
    }
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
        <p className="text-sm text-white/60">{TIPO_GRUPO_LABEL[normalizarTipo(grupo.tipo)]}</p>
      </header>

      {notif && (
        <div className="card border-accent">
          <p className="text-sm text-accent">🔔 {notif}</p>
        </div>
      )}

      {/* SOS destacado, separado del flujo de mensajes normales. */}
      <Link href="/alertas/nueva?sos=1"
        className="btn bg-danger text-white w-full text-xl py-6 font-bold ring-1 ring-white/20">
        🆘 SOS — Pedir auxilio
      </Link>

      {/* Mensajes normales y lectura: acciones aparte, estilo neutro. */}
      <div className="grid gap-2">
        <Link href="/alertas/nueva" className="btn-ghost w-full">✉️ Enviar mensaje al grupo</Link>
        <Link href="/leer" className="btn-ghost w-full">📥 Leer un mensaje recibido</Link>
      </div>

      {/* Tablero de alertas por estado. */}
      <div>
        <p className="label">Alertas del grupo ({alertas.length})</p>
        <div className="grid gap-2">
          {alertas.length === 0 && (
            <p className="text-sm text-white/50">Sin alertas registradas en este dispositivo.</p>
          )}
          {alertas.map((a, i) => {
            const code = a.codigo_corto;
            const abierta = expandida === code;
            const mapa = mapaUrl(a.lat, a.lng);
            return (
              <div key={a.id ?? code ?? i} className="card space-y-2">
                <button className="w-full text-left flex items-start justify-between gap-2"
                  onClick={() => alternarExpandir(a)}>
                  <span>
                    <span className="block font-medium">{describirAlerta(a)}</span>
                    {a.descripcion && <span className="block text-sm text-white/60">{a.descripcion}</span>}
                    <span className="block text-xs text-white/40">{haceCuanto(a.subido_en || a.creado_en)}</span>
                  </span>
                  <span className={`chip shrink-0 ${ESTADO_BADGE[a.estado]}`}>{ESTADO_LABEL[a.estado]}</span>
                </button>

                {abierta && (
                  <div className="space-y-3 border-t border-line pt-3">
                    {mapa && (
                      <a className="btn-ghost text-sm" href={mapa} target="_blank" rel="noreferrer">Ver en mapa</a>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {ACCIONES.map((acc) => (
                        <button key={acc.estado} onClick={() => cambiar(a, acc.estado)}
                          className={`chip ${a.estado === acc.estado ? "bg-accent text-black border-accent" : "text-white/70"}`}>
                          {acc.label}
                        </button>
                      ))}
                    </div>

                    {accionError && difusion?.codigo === code && (
                      <p className="text-sm text-warn">{accionError}</p>
                    )}

                    {/* Difusión del cambio de estado por SMS. */}
                    {difusion?.codigo === code && (
                      <div className="space-y-2">
                        <p className="label mb-0">Difundir cambio por SMS</p>
                        <code className="block bg-base border border-line rounded-lg p-2 text-xs break-words">{difusion.sms}</code>
                        {miembros.filter((m) => m.telefono).length === 0 && (
                          <p className="text-xs text-white/50">No hay teléfonos de miembros en este dispositivo.</p>
                        )}
                        {miembros.filter((m) => m.telefono).map((m, j) => (
                          <a key={m.perfil_id ?? j} className="btn-ghost text-sm w-full" href={smsLink(m.telefono, difusion.sms)}>
                            SMS a {m.nombre || m.telefono}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Historial de estado. */}
                    <div>
                      <p className="label mb-1">Historial</p>
                      {(historial[code] ?? []).length === 0 ? (
                        <p className="text-xs text-white/40">Sin historial disponible (offline o sin cambios).</p>
                      ) : (
                        <ul className="space-y-1">
                          {(historial[code] ?? []).map((h, k) => (
                            <li key={k} className="text-xs text-white/60">
                              {ESTADO_LABEL[h.estado] ?? h.estado} · {haceCuanto(h.creado_en)}
                              {h.nota ? ` · ${h.nota}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
