"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, supabaseConfigured, asegurarSesion } from "@/lib/supabase";
import { guardarGrupoActivo, type Miembro } from "@/lib/cache";

export default function UnirseGrupoPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");

  const [uniendo, setUniendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  // Prellena el código desde el enlace mágico (?g=CODIGO), sin useSearchParams
  // para no requerir un límite de Suspense en el build estático.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const g = new URLSearchParams(window.location.search).get("g");
    if (g) setCodigo(g.toUpperCase());
  }, []);

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

  async function unirse() {
    setError(null);
    if (!userId) { setError("No hay sesión activa todavía. Espera un momento e intenta de nuevo."); return; }
    const cod = codigo.trim().toUpperCase();
    if (cod.length !== 6 || !nombre.trim()) {
      setError("Revisa el código (6 caracteres) y tu nombre.");
      return;
    }
    setUniendo(true);
    try {
      // 1) Busca el grupo por código vía RPC SECURITY DEFINER. La política RLS
      //    de SELECT en `grupos` no deja ver el grupo a un no-miembro, así que
      //    una consulta directa devolvería [] (de ahí el falso "no encontrado").
      const { data, error: eGrupo } = await supabase
        .rpc("buscar_grupo_por_codigo", { p_codigo: cod });
      if (eGrupo) throw eGrupo;
      const grupo = Array.isArray(data) ? data[0] : null;
      if (!grupo) { setError("Código no encontrado."); setUniendo(false); return; }

      // 2) Perfil propio.
      const { error: ePerfil } = await supabase
        .from("perfiles")
        .upsert({ id: userId, nombre: nombre.trim(), telefono: tel.trim() || null });
      if (ePerfil) throw ePerfil;

      // 3) Membresía (sin duplicar si ya era miembro).
      const { error: eMiembro } = await supabase
        .from("grupo_miembros")
        .upsert(
          { grupo_id: grupo.id, perfil_id: userId, nombre: nombre.trim(), telefono: tel.trim() || null },
          { onConflict: "grupo_id,perfil_id" }
        );
      if (eMiembro) throw eMiembro;

      // 4) Descarga la lista de miembros y guarda el grupo activo en cache.
      const { data: miembros } = await supabase
        .from("grupo_miembros")
        .select("perfil_id, nombre, telefono")
        .eq("grupo_id", grupo.id);
      guardarGrupoActivo(
        { id: grupo.id, nombre: grupo.nombre, tipo: grupo.tipo, codigo: cod },
        (miembros ?? []) as Miembro[]
      );

      setListo(true);
      router.push("/grupos/mi");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo unir al grupo.");
    } finally {
      setUniendo(false);
    }
  }

  // ----- Sin Supabase configurado -----
  if (!supabaseConfigured) {
    return (
      <div className="space-y-5">
        <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>
        <h1 className="text-xl font-bold">Unirme a un grupo</h1>
        <div className="card">
          <p className="text-sm text-danger">
            Supabase no está configurado. Define <code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para unirte a un grupo.
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
        <h1 className="text-xl font-bold">Unirme a un grupo</h1>
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
      <h1 className="text-xl font-bold">Unirme a un grupo</h1>
      <p className="text-sm text-white/60">Entra con tu nombre y teléfono. Sin registro ni contraseñas.</p>

      <div>
        <label className="label">Código del grupo</label>
        <input className="input uppercase tracking-[0.3em] text-center text-lg" maxLength={6}
          value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="ABC234" />
      </div>
      <div>
        <label className="label">Tu nombre</label>
        <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder="Cómo te verán en el grupo" />
      </div>
      <div>
        <label className="label">Tu teléfono (opcional)</label>
        <input className="input" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)}
          placeholder="+58 412 555 1234" />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button className="btn-accent w-full disabled:opacity-40"
        disabled={uniendo || listo || !userId || codigo.trim().length !== 6 || !nombre.trim()} onClick={unirse}>
        {uniendo ? "Uniéndome…" : "Unirme al grupo"}
      </button>
    </div>
  );
}
