"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { decodeSms, decrementarTTL } from "@/lib/sms-protocol";
import {
  leerGrupoActivo, buscarMiembroPorTel, alertaYaVista, marcarAlertaVista,
  guardarAlertaLocal, leerAlertasLocales, actualizarEstadoLocal,
  type GrupoActivo, type Miembro,
} from "@/lib/cache";
import {
  describirAlerta, mapaUrl, haceCuanto, smsLink, type Alerta, type EstadoAlerta,
} from "@/lib/alertas";

export default function LeerPage() {
  const [grupo, setGrupo] = useState<GrupoActivo | null>(null);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [texto, setTexto] = useState("");
  const [tel, setTel] = useState("");
  const [estatus, setEstatus] = useState<string | null>(null);
  const [registrado, setRegistrado] = useState(false);

  useEffect(() => {
    const { grupo: g, miembros: m } = leerGrupoActivo();
    setGrupo(g);
    setMiembros(m);
    // Lectura por enlace: ?m=<sms codificado>
    if (typeof window !== "undefined") {
      const m2 = new URLSearchParams(window.location.search).get("m");
      if (m2) setTexto(m2);
    }
  }, []);

  const decoded = useMemo(() => decodeSms(texto), [texto]);
  const reenvio = useMemo(() => (texto ? decrementarTTL(texto) : null), [texto]);

  // Nombre del remitente: solo si se indicó un número conocido del grupo.
  const remitente = useMemo(() => {
    const t = tel.trim();
    if (!t) return null;
    return buscarMiembroPorTel(t) ?? null;
  }, [tel]);

  // Estado entrante: op E trae estado; el contenido (S/N/I) nace ABIERTA.
  const estadoEntrante: EstadoAlerta = useMemo(() => {
    if (decoded?.op === "E" && decoded.estado) return decoded.estado as EstadoAlerta;
    return "ABIERTA";
  }, [decoded]);

  const local = useMemo(() => {
    if (!decoded || !grupo) return null;
    return leerAlertasLocales(grupo.id).find((a) => a.codigo_corto === decoded.id) ?? null;
  }, [decoded, grupo, registrado]);

  function registrar() {
    if (!decoded || !grupo) return;
    setEstatus(null);

    const existente = leerAlertasLocales(grupo.id).find((a) => a.codigo_corto === decoded.id) ?? null;
    const cambio =
      !existente || (decoded.op === "E" && existente.estado !== estadoEntrante);

    if (alertaYaVista(decoded.id) && !cambio) {
      setEstatus("Ya recibiste esta alerta.");
      setRegistrado(true);
      return;
    }

    if (decoded.op === "E") {
      // Cambio de estado de una alerta existente (o la crea mínima si no estaba).
      if (existente) {
        actualizarEstadoLocal(grupo.id, decoded.id, estadoEntrante);
        setEstatus(`Estado actualizado a ${estadoEntrante}.`);
      } else {
        const nueva: Alerta = { codigo_corto: decoded.id, grupo_id: grupo.id, estado: estadoEntrante, creado_en: new Date().toISOString() };
        guardarAlertaLocal(nueva);
        setEstatus(`Estado registrado: ${estadoEntrante}.`);
      }
    } else {
      // Contenido de alerta (S/N/I).
      const alerta: Alerta = {
        codigo_corto: decoded.id,
        grupo_id: grupo.id,
        emisor_id: null, // el texto pegado no trae el id del emisor
        rol: decoded.rol ?? null,
        caso: decoded.caso ?? null,
        descripcion: decoded.descripcion ?? null,
        lat: decoded.lat ?? null,
        lng: decoded.lng ?? null,
        estado: "ABIERTA",
        creado_en: existente?.creado_en ?? new Date().toISOString(),
      };
      guardarAlertaLocal(alerta);
      setEstatus(existente ? "Alerta actualizada." : "Alerta recibida y guardada.");
    }

    marcarAlertaVista(decoded.id);
    setRegistrado(true);
  }

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
      <h1 className="text-xl font-bold">Leer alerta recibida</h1>
      <p className="text-sm text-white/60">Pega el SMS que te llegó para verlo claro y registrarlo en tu grupo.</p>

      <div>
        <label className="label">Mensaje recibido (SMS)</label>
        <textarea className="input min-h-24" value={texto}
          onChange={(e) => { setTexto(e.target.value); setRegistrado(false); setEstatus(null); }}
          placeholder="RX1 7g2k S V ATR @10.601,-66.934 t3" />
      </div>

      <div>
        <label className="label">¿De qué número llegó? (opcional)</label>
        <input className="input" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)}
          placeholder="+58 412 555 1234" />
        <p className="text-xs text-white/40 mt-1">
          {tel.trim() ? (remitente ? `Remitente: ${remitente}` : "Número no está en tu grupo: remitente desconocido")
            : "Sin número: el remitente quedará como desconocido."}
        </p>
      </div>

      {texto && !decoded && (
        <p className="text-sm text-danger">No se pudo leer el mensaje. ¿Es un SMS RX1 válido?</p>
      )}

      {decoded && (
        <div className="card space-y-2">
          <p className="text-lg font-semibold">
            {decoded.op === "E"
              ? `Cambio de estado → ${estadoEntrante}`
              : describirAlerta({ rol: decoded.rol, caso: decoded.caso })}
          </p>
          <p className="text-sm text-white/60">Remitente: {remitente ?? "desconocido"}</p>
          {decoded.descripcion && <p className="text-sm">{decoded.descripcion}</p>}
          <p className="text-xs text-white/40">
            {local?.creado_en ? haceCuanto(local.creado_en) : "recién recibido"}
            {typeof decoded.ttl === "number" ? ` · saltos restantes: ${decoded.ttl}` : ""}
          </p>
          {mapaUrl(decoded.lat, decoded.lng) && (
            <a className="btn-ghost text-sm" href={mapaUrl(decoded.lat, decoded.lng)!} target="_blank" rel="noreferrer">
              Ver en mapa
            </a>
          )}

          {estatus && <p className="text-sm text-ok">{estatus}</p>}

          {!registrado && (
            <button className="btn-accent w-full" onClick={registrar}>Registrar en mi grupo</button>
          )}
        </div>
      )}

      {/* Reenvío en cadena: solo si el TTL aún permite propagar. */}
      {decoded && reenvio && (
        <div>
          <p className="label">Reenviar al grupo (cadena)</p>
          <div className="grid gap-2">
            {miembros.filter((m) => m.telefono).length === 0 && (
              <p className="text-sm text-white/50">No hay teléfonos de miembros en este dispositivo.</p>
            )}
            {miembros.filter((m) => m.telefono).map((m, i) => (
              <a key={m.perfil_id ?? i} className="btn-ghost w-full" href={smsLink(m.telefono, reenvio)}>
                Reenviar a {m.nombre || m.telefono}
              </a>
            ))}
          </div>
        </div>
      )}
      {decoded && !reenvio && typeof decoded.ttl === "number" && (
        <p className="text-xs text-white/40">Este mensaje ya no debe reenviarse (saltos agotados).</p>
      )}
    </div>
  );
}
