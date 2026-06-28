"use client";
import { useState } from "react";
import Link from "next/link";

// Destino del formulario de contacto (mailto).
const CONTACT_EMAIL = "tigrenator.app@gmail.com";

const REPO = "https://github.com/Dvargas005/red-centros-acopio";
const blob = (ruta: string) => `${REPO}/blob/main/${ruta}`;

const DOCS = [
  { ruta: "docs/DECISIONES.md", label: "Decisiones de diseño (docs/DECISIONES.md)" },
  { ruta: "docs/SMS.md", label: "Protocolo SMS (docs/SMS.md)" },
  { ruta: "supabase/schema.sql", label: "Esquema de base de datos (supabase/schema.sql)" },
];

const CLONE_CMD =
  "git clone https://github.com/Dvargas005/red-centros-acopio.git && cd red-centros-acopio && npm install && cp .env.example .env.local && echo 'Edita .env.local con tus claves de Supabase, luego: npm run dev'";

export default function DeveloperPage() {
  const [copiado, setCopiado] = useState(false);

  // Campos del formulario de contacto.
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [mensaje, setMensaje] = useState("");

  const formularioValido =
    nombre.trim() !== "" && email.trim() !== "" && mensaje.trim() !== "";

  async function copiarComando() {
    try {
      await navigator.clipboard.writeText(CLONE_CMD);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  // Sin backend de correo: abrimos un mailto: prellenado. Si luego se quiere
  // envío real, se puede cambiar por una Edge Function o un servicio como
  // Resend / Formspree.
  const mailtoLink = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    `Contacto desde la web — ${nombre}`
  )}&body=${encodeURIComponent(
    `Nombre: ${nombre}\nEmail: ${email}\n\n${mensaje}`
  )}`;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-white/50">&larr; Inicio</Link>

      <header className="space-y-2">
        <h1 className="text-xl font-bold">Soy developer</h1>
        <p className="text-sm text-white/60">
          Documentación técnica, specs y cómo replicar este proyecto en tu máquina.
        </p>
      </header>

      {/* Stack */}
      <section className="card space-y-3">
        <h2 className="font-semibold">Stack</h2>
        <div className="flex flex-wrap gap-2">
          <span className="chip">Next.js 15 (App Router)</span>
          <span className="chip">Supabase</span>
          <span className="chip">Tailwind CSS</span>
          <span className="chip">PWA</span>
          <span className="chip">Magic-link auth</span>
        </div>
        <p className="text-sm text-white/60">
          Frontend en Next.js 15 con App Router, base de datos y auth por
          magic-link en Supabase (protegida con RLS), estilos con Tailwind y
          soporte de instalación como PWA.
        </p>
      </section>

      {/* Enlaces */}
      <section className="card space-y-3">
        <h2 className="font-semibold">Código y documentación</h2>
        <div className="flex flex-col gap-2">
          <a className="btn-ghost w-full" href={REPO} target="_blank" rel="noreferrer">
            Repositorio en GitHub
          </a>
          {DOCS.map((d) => (
            <a
              key={d.ruta}
              className="text-sm text-accent underline"
              href={blob(d.ruta)}
              target="_blank"
              rel="noreferrer"
            >
              {d.label}
            </a>
          ))}
        </div>
      </section>

      {/* Replicar */}
      <section className="card space-y-3">
        <h2 className="font-semibold">Replicar en tu máquina</h2>
        <p className="text-sm text-white/60">
          Clona el repo, instala dependencias y prepara tu entorno local con un
          solo comando:
        </p>
        <code className="block bg-base border border-line rounded-lg p-3 text-xs text-white/80 overflow-x-auto whitespace-pre-wrap break-words">
          {CLONE_CMD}
        </code>
        <button className="btn-ghost w-full" onClick={copiarComando}>
          {copiado ? "¡Copiado!" : "Copiar"}
        </button>
        <p className="text-sm text-white/60">
          Tras clonar, crea un proyecto en Supabase y corre{" "}
          <a
            className="text-accent underline"
            href={blob("supabase/schema.sql")}
            target="_blank"
            rel="noreferrer"
          >
            supabase/schema.sql
          </a>{" "}
          en el editor SQL para crear las tablas y políticas. Luego rellena{" "}
          <code className="text-white/80">.env.local</code> con tus claves y
          ejecuta <code className="text-white/80">npm run dev</code>.
        </p>
      </section>

      {/* Contacto */}
      <section className="card space-y-3">
        <h2 className="font-semibold">Contacto</h2>
        <p className="text-sm text-white/60">
          ¿Dudas o quieres replicar esto en tu comunidad? Escríbeme.
        </p>
        <div>
          <label className="label">Nombre</label>
          <input
            className="input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tu nombre"
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
          />
        </div>
        <div>
          <label className="label">Mensaje</label>
          <textarea
            className="input min-h-24"
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Cuéntame en qué puedo ayudar"
          />
        </div>
        <a
          className="btn-accent w-full disabled:opacity-40"
          href={formularioValido ? mailtoLink : undefined}
          aria-disabled={!formularioValido}
          onClick={(e) => {
            if (!formularioValido) e.preventDefault();
          }}
        >
          Enviar
        </a>
      </section>
    </div>
  );
}
