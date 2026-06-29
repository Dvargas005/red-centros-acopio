"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { leerGrupoActivo, type GrupoActivo } from "@/lib/cache";

export default function Home() {
  const [grupo, setGrupo] = useState<GrupoActivo | null>(null);

  // El grupo activo vive en localStorage (cache.ts ya tolera su ausencia).
  useEffect(() => {
    setGrupo(leerGrupoActivo().grupo);
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold leading-tight">Malla de mensajería de emergencia</h1>
        <p className="text-white/60 text-sm">
          Coordínate con tu familia, vecinos o equipo de rescate en un grupo cerrado.
          Sin registro: entras solo con tu nombre. Alertas claras, aunque la red esté caída.
        </p>
      </header>

      {grupo && (
        <div className="space-y-2">
          {/* SOS: flujo de UN paso, separado del composer normal. */}
          <Link href="/alertas/sos"
            className="btn bg-danger text-white w-full text-xl py-6 font-bold ring-1 ring-white/20">
            🆘 SOS — Pedir auxilio
          </Link>
          {/* Mensaje normal: acción aparte, estilo neutro. */}
          <Link href="/alertas/nueva" className="btn-ghost w-full">
            ✉️ Enviar mensaje al grupo
          </Link>
        </div>
      )}

      <nav className="grid gap-3">
        {grupo && (
          <Link href="/grupos/mi" className="card hover:border-accent transition block">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden>👥</span>
              <span>
                <span className="block font-semibold">Mi grupo</span>
                <span className="block text-sm text-white/60">{grupo.nombre} · código {grupo.codigo}</span>
              </span>
            </div>
          </Link>
        )}

        <Link href="/grupos/crear" className="card hover:border-accent transition block">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>➕</span>
            <span>
              <span className="block font-semibold">Crear grupo</span>
              <span className="block text-sm text-white/60">Abre un grupo cerrado y comparte el código con los tuyos.</span>
            </span>
          </div>
        </Link>

        <Link href="/grupos/unirse" className="card hover:border-accent transition block">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>🔑</span>
            <span>
              <span className="block font-semibold">Unirme a un grupo</span>
              <span className="block text-sm text-white/60">Tienes un código de 6 caracteres o un enlace de invitación.</span>
            </span>
          </div>
        </Link>

        <Link href="/leer" className="card hover:border-accent transition block">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>📥</span>
            <span>
              <span className="block font-semibold">Leer alerta recibida</span>
              <span className="block text-sm text-white/60">Pega un SMS que te llegó para verlo claro y registrarlo.</span>
            </span>
          </div>
        </Link>
      </nav>

      <footer className="pt-2 flex justify-center">
        <Link href="/developer" className="text-sm text-white/50 underline">
          Soy developer: documentación técnica
        </Link>
      </footer>
    </div>
  );
}
