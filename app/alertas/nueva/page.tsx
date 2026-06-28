"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, supabaseConfigured, asegurarSesion } from "@/lib/supabase";
import {
  ROL_CODE, CASOS_POR_ROL, generarId, encodeSms,
} from "@/lib/sms-protocol";
import {
  leerGrupoActivo, marcarAlertaVista, guardarAlertaLocal,
  type GrupoActivo, type Miembro,
} from "@/lib/cache";
import {
  upsertAlertaContenido, hayConexion, smsLink, type Alerta,
} from "@/lib/alertas";
import { enqueue } from "@/lib/offline";

const TTL_DEFECTO = 3;
const ROLES: { code: string; label: string; emoji: string }[] = [
  { code: "V", label: "Víctima", emoji: "🆘" },
  { code: "R", label: "Rescatista", emoji: "⛑️" },
  { code: "F", label: "Familiar", emoji: "👪" },
  { code: "C", label: "Centro", emoji: "🏥" },
];

export default function NuevaAlertaPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<GrupoActivo | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [cargado, setCargado] = useState(false);

  const [rol, setRol] = useState<string>("");
  const [caso, setCaso] = useState<string>("");
  const [nota, setNota] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [smsTexto, setSmsTexto] = useState<string | null>(null);

  useEffect(() => {
    const { grupo: g, miembros: m } = leerGrupoActivo();
    setGrupo(g);
    setMiembros(m);
    setCargado(true);
    if (!supabaseConfigured) return;
    let activo = true;
    asegurarSesion()
      .then((uid) => { if (activo) setUserId(uid); })
      .catch((e) => { if (activo) setAuthError(e instanceof Error ? e.message : String(e)); });
    return () => { activo = false; };
  }, []);

  function pedirUbicacion() {
    setGeoMsg(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMsg("Este dispositivo no permite ubicación. La alerta se envía sin coordenadas.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) }),
      () => setGeoMsg("No se pudo obtener la ubicación (permiso denegado). La alerta se envía sin coordenadas."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function crearAlerta() {
    setError(null);
    setAviso(null);
    if (!grupo) { setError("No tienes un grupo activo."); return; }
    if (!rol || !caso) { setError("Elige el rol y el caso."); return; }
    setEnviando(true);
    try {
      const id = generarId();
      const texto = encodeSms({
        id, op: "S", rol, caso,
        descripcion: nota.trim() || undefined,
        lat: coords?.lat, lng: coords?.lng, ttl: TTL_DEFECTO,
      });

      const alerta: Alerta = {
        codigo_corto: id,
        grupo_id: grupo.id,
        emisor_id: userId,
        rol: ROL_CODE[rol] ?? null,
        caso,
        descripcion: nota.trim() || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        estado: "ABIERTA",
      };

      // Guarda local siempre (tablero offline + de-dup propio).
      guardarAlertaLocal(alerta);
      marcarAlertaVista(id);

      if (supabaseConfigured && hayConexion() && userId) {
        const { error: e } = await upsertAlertaContenido(alerta);
        if (e) {
          enqueue("alertas", alerta as unknown as Record<string, unknown>);
          setAviso("Sin poder guardar en la nube ahora; quedó en cola para reintentar. Ya puedes difundirla por SMS.");
        }
      } else {
        enqueue("alertas", alerta as unknown as Record<string, unknown>);
        setAviso("Sin datos: la alerta quedó en cola y lista para difundir por SMS.");
      }

      setSmsTexto(texto);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la alerta.");
    } finally {
      setEnviando(false);
    }
  }

  // ----- Sin grupo activo -----
  if (cargado && !grupo) {
    return (
      <div className="space-y-5">
        <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
        <h1 className="text-xl font-bold">Enviar alerta</h1>
        <div className="card space-y-3">
          <p className="text-sm text-white/60">Necesitas un grupo activo para enviar alertas.</p>
          <Link href="/grupos/crear" className="btn-accent w-full">Crear grupo</Link>
          <Link href="/grupos/unirse" className="btn-ghost w-full">Unirme a un grupo</Link>
        </div>
      </div>
    );
  }

  // ----- Pantalla de difusión (alerta creada) -----
  if (smsTexto) {
    return (
      <div className="space-y-5">
        <Link href="/grupos/mi" className="text-sm text-white/50">&larr; Mi grupo</Link>
        <h1 className="text-xl font-bold">Alerta lista para difundir</h1>
        {aviso && <p className="text-sm text-warn">{aviso}</p>}

        <div className="card space-y-2">
          <p className="label mb-0">Mensaje RX1 ({smsTexto.length}/160)</p>
          <code className="block bg-base border border-line rounded-lg p-3 text-sm break-words">{smsTexto}</code>
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
              <a key={m.perfil_id ?? i} className="btn-accent w-full" href={smsLink(m.telefono, smsTexto)}>
                SMS a {m.nombre || m.telefono}
              </a>
            ))}
          </div>
        </div>

        <Link href="/grupos/mi" className="btn-ghost w-full">Ir al tablero del grupo</Link>
      </div>
    );
  }

  // ----- Composer -----
  const casos = rol ? CASOS_POR_ROL[rol] ?? {} : {};
  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
      <h1 className="text-xl font-bold">🆘 Enviar alerta</h1>
      {grupo && <p className="text-sm text-white/60">Grupo: {grupo.nombre} · código {grupo.codigo}</p>}
      {authError && <p className="text-sm text-warn">{authError} Aún puedes difundir por SMS.</p>}

      <div>
        <label className="label">¿Quién reporta?</label>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <button key={r.code} onClick={() => { setRol(r.code); setCaso(""); }}
              className={`card text-center ${rol === r.code ? "border-accent" : ""}`}>
              <span className="block text-2xl" aria-hidden>{r.emoji}</span>
              <span className="block text-sm font-semibold mt-1">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      {rol && (
        <div>
          <label className="label">¿Qué ocurre?</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(casos).map(([code, texto]) => (
              <button key={code} onClick={() => setCaso(code)}
                className={`chip ${caso === code ? "bg-accent text-black border-accent" : "text-white/70"}`}>
                {texto}
              </button>
            ))}
          </div>
        </div>
      )}

      {caso && (
        <>
          <div>
            <label className="label">Nota corta (opcional)</label>
            <input className="input" value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="Piso 3, apto B · adulto mayor" />
          </div>

          <div className="space-y-1">
            <button className="btn-ghost w-full" onClick={pedirUbicacion}>
              {coords ? `Ubicación adjunta ✓ (${coords.lat}, ${coords.lng})` : "Adjuntar mi ubicación"}
            </button>
            {geoMsg && <p className="text-xs text-warn">{geoMsg}</p>}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button className="btn-accent w-full disabled:opacity-40" disabled={enviando} onClick={crearAlerta}>
            {enviando ? "Creando…" : "Crear alerta y preparar SMS"}
          </button>
        </>
      )}
    </div>
  );
}
