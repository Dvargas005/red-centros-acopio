"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseConfigured, asegurarSesion } from "@/lib/supabase";
import { generarId, encodeSms } from "@/lib/sms-protocol";
import { mensajesDeTipo, type Mensaje } from "@/lib/catalogo";
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

export default function NuevaAlertaPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<GrupoActivo | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [cargado, setCargado] = useState(false);

  const [sel, setSel] = useState<Mensaje | null>(null);
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

  // Nombre legible del emisor (el miembro de este dispositivo).
  const miNombre = useMemo(() => {
    const yo = miembros.find((m) => m.perfil_id && m.perfil_id === userId);
    return yo?.nombre || miembros[0]?.nombre || "";
  }, [miembros, userId]);

  // Mensajes del catálogo según el tipo del grupo, separados auxilio / normales.
  const { sos, normales } = useMemo(() => {
    const lista = grupo ? mensajesDeTipo(grupo.tipo) : [];
    return {
      sos: lista.filter((m) => m.sos),
      normales: lista.filter((m) => !m.sos),
    };
  }, [grupo]);

  function pedirUbicacion() {
    setGeoMsg(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMsg("Este dispositivo no permite ubicación. El mensaje se envía sin coordenadas.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) }),
      () => setGeoMsg("No se pudo obtener la ubicación (permiso denegado). El mensaje se envía sin coordenadas."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function crear() {
    setError(null);
    setAviso(null);
    if (!grupo) { setError("No tienes un grupo activo."); return; }
    if (!sel) { setError("Elige un mensaje."); return; }
    if (sel.pideLugar && !nota.trim()) { setError("Indica el lugar de encuentro."); return; }
    setEnviando(true);
    try {
      const id = generarId();
      const texto = encodeSms({
        id, op: "S", caso: sel.code,
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
        caso: sel.code,
        // El placeholder [lugar] viaja dentro del texto del SMS; la nota se
        // guarda como descripción salvo cuando ya se incrustó como lugar.
        descripcion: sel.pideLugar ? `Lugar: ${nota.trim()}` : (nota.trim() || null),
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
          setAviso("Sin poder guardar en la nube ahora; quedó en cola para reintentar. Ya puedes difundirlo por SMS.");
        }
      } else {
        enqueue("alertas", alerta as unknown as Record<string, unknown>);
        setAviso("Sin datos: el mensaje quedó en cola y listo para difundir por SMS. Subirá solo al reconectar.");
      }

      setSmsTexto(texto);
      // Intento oportunista de vaciar la cola si justo hay conexión.
      void sincronizarOutbox();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el mensaje.");
    } finally {
      setEnviando(false);
    }
  }

  // ----- Sin grupo activo -----
  if (cargado && !grupo) {
    return (
      <div className="space-y-5">
        <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
        <h1 className="text-xl font-bold">Enviar mensaje</h1>
        <div className="card space-y-3">
          <p className="text-sm text-white/60">Necesitas un grupo activo para enviar mensajes.</p>
          <Link href="/grupos/crear" className="btn-accent w-full">Crear grupo</Link>
          <Link href="/grupos/unirse" className="btn-ghost w-full">Unirme a un grupo</Link>
        </div>
      </div>
    );
  }

  // ----- Pantalla de difusión (mensaje listo) -----
  if (smsTexto) {
    return (
      <div className="space-y-5">
        <Link href="/grupos/mi" className="text-sm text-white/50">&larr; Mi grupo</Link>
        <h1 className="text-xl font-bold">Mensaje listo para difundir</h1>
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
  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
      <h1 className="text-xl font-bold">Enviar mensaje</h1>
      {grupo && <p className="text-sm text-white/60">Grupo: {grupo.nombre} · código {grupo.codigo}</p>}
      {authError && <p className="text-sm text-warn">{authError} Aún puedes difundir por SMS.</p>}

      {/* AUXILIO (SOS): destacado, rojo, separado del flujo normal. */}
      {sos.length > 0 && (
        <section className="space-y-2 rounded-xl border border-danger/60 bg-danger/5 p-3">
          <p className="label mb-0 text-danger">🆘 Auxilio (SOS)</p>
          <div className="grid gap-2">
            {sos.map((m) => (
              <button key={m.code} onClick={() => { setSel(m); setNota(""); }}
                className={`btn w-full font-bold text-white ${sel?.code === m.code ? "bg-danger ring-2 ring-white/50" : "bg-danger/90"}`}>
                {m.texto}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* MENSAJES NORMALES: sección aparte, estilo neutro. */}
      {normales.length > 0 && (
        <section className="space-y-2">
          <p className="label mb-0">Mensajes</p>
          <div className="flex flex-wrap gap-2">
            {normales.map((m) => (
              <button key={m.code} onClick={() => { setSel(m); setNota(""); }}
                className={`chip ${sel?.code === m.code ? "bg-accent text-black border-accent" : "text-white/80"}`}>
                {m.texto}
              </button>
            ))}
          </div>
        </section>
      )}

      {sel && (
        <div className="space-y-4 border-t border-line pt-4">
          <p className="text-sm">
            Seleccionado: <span className="font-semibold">{sel.texto}</span>
          </p>

          {sel.pideLugar ? (
            <div>
              <label className="label">¿Dónde? (lugar de encuentro)</label>
              <input className="input" value={nota} onChange={(e) => setNota(e.target.value)}
                placeholder="Ej: plaza Bolívar · casa de la abuela" />
            </div>
          ) : (
            <div>
              <label className="label">Nota corta (opcional)</label>
              <input className="input" value={nota} onChange={(e) => setNota(e.target.value)}
                placeholder="Piso 3, apto B · adulto mayor" />
            </div>
          )}

          <div className="space-y-1">
            <button className="btn-ghost w-full" onClick={pedirUbicacion}>
              {coords ? `Ubicación adjunta ✓ (${coords.lat}, ${coords.lng})` : "Adjuntar mi ubicación"}
            </button>
            {geoMsg && <p className="text-xs text-warn">{geoMsg}</p>}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button className="btn-accent w-full disabled:opacity-40" disabled={enviando} onClick={crear}>
            {enviando ? "Preparando…" : "Preparar SMS para el grupo"}
          </button>
        </div>
      )}

      {error && !sel && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
