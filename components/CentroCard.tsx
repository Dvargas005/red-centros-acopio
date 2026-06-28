type Centro = {
  id: string;
  nombre: string;
  direccion: string;
  ciudad?: string | null;
  estado_geo?: string | null;
  distancia_km?: number | null;
};

export default function CentroCard({ c, contacto }: { c: Centro; contacto?: string | null }) {
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${c.direccion} ${c.ciudad ?? ""} ${c.estado_geo ?? ""}`
  )}`;
  return (
    <div className="card space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{c.nombre}</h3>
        {typeof c.distancia_km === "number" && (
          <span className="chip text-white/60">{c.distancia_km.toFixed(1)} km</span>
        )}
      </div>
      <p className="text-sm text-white/60">
        {c.direccion}
        {c.ciudad ? `, ${c.ciudad}` : ""}
        {c.estado_geo ? ` (${c.estado_geo})` : ""}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <a className="btn-ghost text-sm" href={maps} target="_blank" rel="noreferrer">
          Cómo llegar
        </a>
        {contacto && (
          <a
            className="btn-ghost text-sm"
            href={`https://wa.me/${contacto.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp al organizador
          </a>
        )}
      </div>
    </div>
  );
}
