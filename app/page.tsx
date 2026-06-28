// NOTA (pivote RX1): este home se reescribirá en el PASO 2. El contenido
// actual es del proyecto de "centros de acopio" y quedará reemplazado por
// la malla de mensajería de emergencia por grupos cerrados. No tocar la UI
// en el paso de fundación.
import Link from "next/link";

const ROLES = [
  {
    href: "/donar",
    titulo: "Quiero donar",
    desc: "Dime qué tienes y dónde estás. Te muestro los centros más cercanos. Anónimo.",
    emoji: "📦",
  },
  {
    href: "/empresa",
    titulo: "Soy empresa",
    desc: "Donación en volumen. Coordinamos logística con el centro adecuado.",
    emoji: "🏢",
  },
  {
    href: "/apoyar",
    titulo: "Quiero apoyar",
    desc: "Sé voluntario. Verás centros que necesitan manos y el contacto del organizador.",
    emoji: "🤝",
  },
  {
    href: "/crear-centro",
    titulo: "Crear centro de acopio",
    desc: "Registra tu punto de recolección: ubicación, horarios y qué necesitas.",
    emoji: "📍",
  },
  {
    href: "/developer",
    titulo: "Soy developer",
    desc: "Documentación técnica, specs y cómo replicar este proyecto.",
    emoji: "💻",
  },
];

export default function Home() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold leading-tight">Red de Centros de Acopio</h1>
        <p className="text-white/60 text-sm">
          Coordinación abierta de ayuda en emergencia. Sin marca, sin costo, replicable.
        </p>
      </header>

      <nav className="grid gap-3">
        {ROLES.map((r) => (
          <Link key={r.href} href={r.href} className="card hover:border-accent transition block">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden>{r.emoji}</span>
              <span>
                <span className="block font-semibold">{r.titulo}</span>
                <span className="block text-sm text-white/60">{r.desc}</span>
              </span>
            </div>
          </Link>
        ))}
      </nav>

      <footer className="pt-2 flex flex-col items-center gap-2">
        <Link href="/apoyar" className="text-sm text-accent underline">
          Ver mapa de necesidades entre centros
        </Link>
        <Link href="/actualizar" className="text-sm text-white/50 underline">
          Soy organizador: actualizar mi centro por SMS
        </Link>
      </footer>
    </div>
  );
}
