"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseConfigured, asegurarSesion } from "@/lib/supabase";
import { generarId, encodeSms } from "@/lib/sms-protocol";
import { MENSAJES, mensajesDeTipo, normalizarTipo, type TipoGrupo } from "@/lib/catalogo";
import {
  leerGrupoActivo, marcarAlertaVista, guardarAlertaLocal,
  type GrupoActivo, type Miembro,
} from "@/lib/cache";
import {
  upsertAlertaContenido, hayConexion, smsLink, type Alerta,
} from "@/lib/alertas";
import { enqueue } from "@/lib/offline";
import { sincronizarOutbox } from "@/lib/sync";

const TTL_DEFECTO = 3;

// Caso de emergencia preseleccionado por tipo de grupo (el más urgente).
//   FAMILIA / COMUNIDAD_VECINOS -> "Necesito ayuda" (AYU)
//   RESCATE                     -> "Atrapado" (ATR)
const DEFECTO_SOS: Record<TipoGrupo, string> = {
  FAMILIA: "AYU",
  COMUNIDAD_VECINOS: "AYU",
  RESCATE: "ATR",
};

export default function SosPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<GrupoActivo | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [cargado, setCargado] = useState(false);

  const [caso, setCaso] = useState<string>("");
  const [nota, setNota] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [geoCargando, setGeoCargando] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [smsTexto, setSmsTexto] = useState<string | null>(null);

  const geoPedida = useRef(false);

  // Captura de ubicación; se dispara automáticamente al entrar. Si la niegan,
  // sigue sin coordenadas y avisa.
  function pedirUbicacion() {
    setGeoMsg(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMsg("Este dispositivo no permite ubicación. El SOS se envía sin coordenadas.");
      return;
    }
    setGeoCargando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) });
        setGeoCargando(false);
      },
      () => {
        setGeoMsg("No se pudo obtener la ubicación (permiso denegado). El SOS se envía sin coordenadas.");
        setGeoCargando(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  useEffect(() => {
    const { grupo: g, miembros: m } = leerGrupoActivo();
    setGrupo(g);
    setMiembros(m);
    setCargado(true);

    // Preselecciona el caso de emergencia del tipo del grupo.
    if (g) setCaso(DEFECTO_SOS[normalizarTipo(g.tipo)]);

    // Dispara la ubicación automáticamente (una sola vez).
    if (g && !geoPedida.current) {
      geoPedida.current = true;
      pedirUbicacion();
    }

    if (!supabaseConfigured) return;
    let activo = true;
    asegurarSesion()
      .then((uid) => { if (activo) setUserId(uid); })
      .catch((e) => { if (activo) setAuthError(e instanceof Error ? e.message : String(e)); });
    return () => { activo = false; };
  }, []);

  const miNombre = useMemo(() => {
    const yo = miembros.find((m) => m.perfil_id && m.perfil_id === userId);
    return yo?.nombre || miembros[0]?.nombre || "";
  }, [miembros, userId]);

  // Casos de auxilio (SOS) del tipo, para poder cambiar el preseleccionado.
  const sosCasos = useMemo(
    () => (grupo ? mensajesDeTipo(grupo.tipo).filter((m) => m.sos) : []),
    [grupo]
  );

  async function enviar() {
    setError(null);
    setAviso(null);
    if (!grupo) { setError("No tienes un grupo activo."); return; }
    if (!caso) { setError("No hay un caso de emergencia para este grupo."); return; }
    setEnviando(true);
    try {
      const id = generarId();
      const texto = encodeSms({
        id, op: "S", caso,
        descripcion: nota.trim() || undefined,
        nombre: miNombre || undefined,
        grupo: grupo.nombre,
        lat: coords?.lat, lng: coords?.lng, ttl: TTL_DEFECTO,
      });

      const alerta: Alerta = {
        codigo_corto: id,
        grupo_id: grupo.id,
        emisor_id: userId,
        rol: null,
        caso,
        descripcion: nota.trim() || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        estado: "ABIERTA",
      };

      guardarAlertaLocal(alerta);
      marcarAlertaVista(id);

      if (supabaseConfigured && hayConexion() && userId) {
        const { error: e } = await upsertAlertaContenido(alerta);
        if (e) {
          enqueue("alertas", alerta as unknown as Record<string, unknown>);
          setAviso("Sin poder guardar en la nube ahora; quedó en cola para reintentar. Ya puedes difundirlo por SMS.");
        }
      } else {
        enqueue("alertas", alerta as unknown as Record<string, unknown>);
        setAviso("Sin datos: el SOS quedó en cola y listo para difundir por SMS. Subirá solo al reconectar.");
      }

      setSmsTexto(texto);
      void sincronizarOutbox();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo preparar el SOS.");
    } finally {
      setEnviando(false);
    }
  }

  // ----- Sin grupo activo -----
  if (cargado && !grupo) {
    return (
      <div className="space-y-5">
        <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
        <h1 className="text-xl font-bold">Pedir auxilio</h1>
        <div className="card space-y-3">
          <p className="text-sm text-white/60">Necesitas un grupo activo para pedir auxilio.</p>
          <Link href="/grupos/crear" className="btn-accent w-full">Crear grupo</Link>
          <Link href="/grupos/unirse" className="btn-ghost w-full">Unirme a un grupo</Link>
        </div>
      </div>
    );
  }

  // ----- Pantalla de difusión (SOS listo) -----
  if (smsTexto) {
    return (
      <div className="space-y-5">
        <Link href="/grupos/mi" className="text-sm text-white/50">&larr; Mi grupo</Link>
        <h1 className="text-xl font-bold">🆘 SOS listo para difundir</h1>
        {aviso && <p className="text-sm text-warn">{aviso}</p>}

        <div className="card space-y-2">
          <p className="label mb-0">Texto del SMS ({smsTexto.length} caracteres)</p>
          <code className="block bg-base border border-line rounded-lg p-3 text-sm break-words whitespace-pre-wrap">{smsTexto}</code>
          <p className="text-xs text-white/40">Cualquiera lo entiende, aunque no tenga la app.</p>
          <button className="btn-ghost w-full" onClick={() => navigator.clipboard?.writeText(smsTexto)}>
            Copiar mensaje
          </button>
        </div>

        <div>
          <p className="label">Enviar por SMS a cada miembro (un toque c/u)</p>
          <div className="grid gap-2">
            {miembros.filter((m) => m.telefono).length === 0 && (
              <p className="text-sm text-white/50">No hay teléfonos de miembros en este dispositivo.</p>
            )}
            {miembros.filter((m) => m.telefono).map((m, i) => (
              <a key={m.perfil_id ?? i} className="btn bg-danger text-white w-full font-bold" href={smsLink(m.telefono, smsTexto)}>
                SMS a {m.nombre || m.telefono}
              </a>
            ))}
          </div>
        </div>

        <Link href="/grupos/mi" className="btn-ghost w-full">Ir al tablero del grupo</Link>
      </div>
    );
  }

  // ----- Pantalla de un solo paso -----
  const casoLegible = caso ? (MENSAJES[caso]?.texto ?? caso) : "";
  return (
    <div className="space-y-5">
      <Link href="/grupos/mi" className="text-sm text-white/50">&larr; Mi grupo</Link>
      <h1 className="text-2xl font-bold text-danger">🆘 Pedir auxilio</h1>
      {grupo && <p className="text-sm text-white/60">Grupo: {grupo.nombre}</p>}
      {authError && <p className="text-sm text-warn">{authError} Aún puedes difundir por SMS.</p>}

      {/* Caso ya elegido, destacado. */}
      <div className="rounded-xl border border-danger/60 bg-danger/5 p-4 space-y-1">
        <p className="label mb-0 text-danger">Emergencia</p>
        <p className="text-xl font-bold">{casoLegible}</p>
      </div>

      {/* Cambiar el tipo de auxilio (opcional; ya viene preseleccionado). */}
      {sosCasos.length > 1 && (
        <div>
          <p className="label">¿Otro tipo de auxilio?</p>
          <div className="flex flex-wrap gap-2">
            {sosCasos.map((m) => (
              <button key={m.code} onClick={() => setCaso(m.code)}
                className={`chip ${caso === m.code ? "bg-danger text-white border-danger" : "text-white/70"}`}>
                {m.texto}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Estado de la ubicación (capturada automáticamente). */}
      <div className="space-y-1">
        {coords ? (
          <p className="text-sm text-ok">📍 Ubicación adjunta ✓ ({coords.lat}, {coords.lng})</p>
        ) : geoCargando ? (
          <p className="text-sm text-white/60">📍 Obteniendo tu ubicación…</p>
        ) : (
          <button className="btn-ghost w-full" onClick={pedirUbicacion}>Reintentar ubicación</button>
        )}
        {geoMsg && <p className="text-xs text-warn">{geoMsg}</p>}
      </div>

      {/* Nota opcional. */}
      <div>
        <label className="label">Nota corta (opcional)</label>
        <input className="input" value={nota} onChange={(e) => setNota(e.target.value)}
          placeholder="Piso 3, apto B · adulto mayor" />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button className="btn bg-danger text-white w-full text-lg py-5 font-bold disabled:opacity-40"
        disabled={enviando || !caso} onClick={enviar}>
        {enviando ? "Preparando…" : "Preparar SOS para el grupo"}
      </button>

      <Link href="/alertas/nueva" className="block text-center text-sm text-white/50 underline">
        No es una emergencia: enviar un mensaje normal
      </Link>
    </div>
  );
}
