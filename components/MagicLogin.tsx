"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function MagicLogin({ titulo }: { titulo: string }) {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.href : undefined },
    });
    if (error) setError(error.message);
    else setEnviado(true);
  }

  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">{titulo}</h2>
      <p className="text-sm text-white/60">
        Te enviamos un enlace de acceso a tu correo. Sin contraseñas, sin costo.
      </p>
      {enviado ? (
        <p className="text-sm text-ok">Revisa tu correo y abre el enlace para continuar.</p>
      ) : (
        <>
          <input className="input" type="email" placeholder="tu@correo.com"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn-accent w-full disabled:opacity-40" disabled={!email} onClick={enviar}>
            Enviar enlace de acceso
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </>
      )}
    </div>
  );
}
