import Link from "next/link";

// Fallback offline: lo sirve el service worker cuando una navegación no está
// en caché y no hay red. Es estático para precachearse en 'install'.
export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Estás sin conexión</h1>
      <div className="card space-y-3">
        <p className="text-sm text-white/60">
          No hay datos ahora mismo, pero la app sigue funcionando con lo que ya
          tienes guardado en este dispositivo: tu grupo, sus miembros y las
          alertas que ya viste.
        </p>
        <p className="text-sm text-white/60">
          Puedes componer un mensaje y difundirlo por SMS. Lo que crees subirá
          solo a la nube en cuanto regrese la conexión.
        </p>
        <Link href="/grupos/mi" className="btn-accent w-full">Ir a mi grupo</Link>
        <Link href="/alertas/nueva" className="btn-ghost w-full">Enviar un mensaje</Link>
        <Link href="/" className="btn-ghost w-full">Inicio</Link>
      </div>
    </div>
  );
}
