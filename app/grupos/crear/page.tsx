"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, supabaseConfigured, asegurarSesion } from "@/lib/supabase";
import { guardarGrupoActivo } from "@/lib/cache";

type Tipo = "FAMILIA_VECINOS" | "RESCATE";

// Alfabeto sin caracteres ambiguos (excluye O, 0, I, 1, L).
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generarCodigo(): string {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return s;
}

function enlaceInvitacion(codigo: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/grupos/unirse?g=${codigo}`;
}

export default function CrearGrupoPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<Tipo>("FAMILIA_VECINOS");
  const [creadorNombre, setCreadorNombre] = useState("");
  const [creadorTel, setCreadorTel] = useState("");

  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codigoCreado, setCodigoCreado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<"codigo" | "enlace" | null>(null);

  // Sesión sin fricción: reutiliza la existente o crea una anónima silenciosa.
  useEffect(() => {
    if (!supabaseConfigured) return;
    let activo = true;
    asegurarSesion()
      .then((uid) => { if (activo) setUserId(uid); })
      .catch((e) => { if (activo) setAuthError(e instanceof Error ? e.message : String(e)); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (activo) setUserId(session?.user?.id ?? null);
    });
    return () => { activo = false; sub.subscription.unsubscribe(); };
  }, []);

  async function crear() {
    setError(null);
    if (!userId) { setError("No hay sesión activa todavía. Espera un momento e intenta de nuevo."); return; }
    if (!nombre.trim() || !creadorNombre.trim()) {
      setError("Completa el nombre del grupo y tu nombre.");
      return;
    }
    setCreando(true);
    try {
      // 1) Perfil del creador.
      const { error: ePerfil } = await supabase
        .from("perfiles")
        .upsert({ id: userId, nombre: creadorNombre.trim(), telefono: creadorTel.trim() || null });
      if (ePerfil) throw ePerfil;

      // 2) Inserta el grupo, reintentando si el código choca (unique).
      let codigo = "";
      let grupoId = "";
      let intentos = 0;
      // 23505 = unique_violation en Postgres.
      while (intentos < 6) {
        codigo = generarCodigo();
        const { data, error: eGrupo } = await supabase
          .from("grupos")
          .insert({ nombre: nombre.trim(), tipo, codigo, creador_id: userId })
          .select("id")
          .single();
        if (!eGrupo && data) { grupoId = data.id; break; }
        if (eGrupo && (eGrupo as { code?: string }).code !== "23505") throw eGrupo;
        intentos++;
      }
      if (!grupoId) throw new Error("No se pudo generar un código único. Intenta de nuevo.");

      // 3) Inserta al creador como miembro.
      const { error: eMiembro } = await supabase
        .from("grupo_miembros")
        .insert({
          grupo_id: grupoId,
          perfil_id: userId,
          nombre: creadorNombre.trim(),
          telefono: creadorTel.trim() || null,
        });
      if (eMiembro) throw eMiembro;

      // 4) Cache local del grupo activo + miembros.
      guardarGrupoActivo(
        { id: grupoId, nombre: nombre.trim(), tipo, codigo },
        [{ perfil_id: userId, nombre: creadorNombre.trim(), telefono: creadorTel.trim() || undefined }]
      );

      setCodigoCreado(codigo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el grupo.");
    } finally {
      setCreando(false);
    }
  }

  function copiar(texto: string, cual: "codigo" | "enlace") {
    navigator.clipboard?.writeText(texto);
    setCopiado(cual);
  }

  // ----- Pantalla de éxito -----
  if (codigoCreado) {
    return (
      <div className="space-y-5">
        <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
        <h1 className="text-xl font-bold">Grupo creado</h1>
        <div className="card space-y-4 text-center">
          <p className="text-sm text-white/60">Comparte este código con tu gente:</p>
          <p className="text-4xl font-bold tracking-[0.3em] text-accent">{codigoCreado}</p>
          <div className="flex flex-col gap-2">
            <button className="btn-ghost w-full" onClick={() => copiar(codigoCreado, "codigo")}>
              {copiado === "codigo" ? "Código copiado ✓" : "Copiar código"}
            </button>
            <button className="btn-accent w-full" onClick={() => copiar(enlaceInvitacion(codigoCreado), "enlace")}>
              {copiado === "enlace" ? "Enlace copiado ✓" : "Copiar enlace de invitación"}
            </button>
          </div>
        </div>
        <Link href="/grupos/mi" className="btn-ghost w-full">Ir a mi grupo</Link>
      </div>
    );
  }

  // ----- Sin Supabase configurado -----
  if (!supabaseConfigured) {
    return (
      <div className="space-y-5">
        <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
        <h1 className="text-xl font-bold">Crear grupo</h1>
        <div className="card">
          <p className="text-sm text-danger">
            Supabase no está configurado. Define <code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para crear grupos.
          </p>
        </div>
      </div>
    );
  }

  // ----- Falló la sesión anónima (proveedor deshabilitado) -----
  if (authError) {
    return (
      <div className="space-y-5">
        <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
        <h1 className="text-xl font-bold">Crear grupo</h1>
        <div className="card">
          <p className="text-sm text-danger">{authError}</p>
        </div>
      </div>
    );
  }

  // ----- Formulario -----
  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
      <h1 className="text-xl font-bold">Crear grupo</h1>
      <p className="text-sm text-white/60">Entra con tu nombre y teléfono. Sin registro ni contraseñas.</p>

      <div>
        <label className="label">Nombre del grupo</label>
        <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder="Familia Pérez · Edificio Los Robles" />
      </div>

      <div>
        <label className="label">Tipo de grupo</label>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setTipo("FAMILIA_VECINOS")}
            className={`card text-center ${tipo === "FAMILIA_VECINOS" ? "border-accent" : ""}`}>
            <span className="block text-2xl" aria-hidden>🏠</span>
            <span className="block text-sm font-semibold mt-1">Familia / Vecinos</span>
          </button>
          <button onClick={() => setTipo("RESCATE")}
            className={`card text-center ${tipo === "RESCATE" ? "border-accent" : ""}`}>
            <span className="block text-2xl" aria-hidden>🚨</span>
            <span className="block text-sm font-semibold mt-1">Rescate</span>
          </button>
        </div>
      </div>

      <div>
        <label className="label">Tu nombre</label>
        <input className="input" value={creadorNombre} onChange={(e) => setCreadorNombre(e.target.value)}
          placeholder="Cómo te verán en el grupo" />
      </div>
      <div>
        <label className="label">Tu teléfono (opcional)</label>
        <input className="input" inputMode="tel" value={creadorTel} onChange={(e) => setCreadorTel(e.target.value)}
          placeholder="+58 412 555 1234" />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button className="btn-accent w-full disabled:opacity-40"
        disabled={creando || !userId || !nombre.trim() || !creadorNombre.trim()} onClick={crear}>
        {creando ? "Creando…" : "Crear grupo"}
      </button>
    </div>
  );
}
