// =============================================================
//  Catálogo de mensajes por tipo de grupo
//
//  Fuente única de verdad de los mensajes que la app sabe componer. Cada
//  mensaje tiene:
//    - code:  identificador corto y estable (MAYÚSCULAS). Va dentro de los
//             corchetes del SMS legible para de-dup y para que decodeSms
//             reconstruya el caso sin depender del texto visible.
//    - texto: etiqueta legible en español (lo que ve el humano).
//    - sos:   true si es una alerta de auxilio (se compone con prefijo "SOS").
//    - pideLugar: true si el texto trae un "[lugar]" a completar.
//
//  El catálogo se organiza por TIPO DE GRUPO (no por rol): el composer solo
//  ofrece los mensajes que aplican al grupo activo. NADA de "víctima" en
//  familia — los textos son neutros y humanos.
//
//  Relación con el protocolo (lib/sms-protocol.ts): sms-protocol importa
//  MENSAJES para mapear code -> texto al codificar/decodificar. La dependencia
//  va en un solo sentido (sms-protocol -> catalogo) para no crear ciclos.
// =============================================================

export type TipoGrupo = "FAMILIA" | "COMUNIDAD_VECINOS" | "RESCATE";

export type Mensaje = {
  code: string;
  texto: string;
  sos?: boolean;
  pideLugar?: boolean;
};

// ---------- Catálogo maestro: code -> mensaje ----------
export const MENSAJES: Record<string, Mensaje> = {
  // --- Familia (base, también disponible en comunidad) ---
  SAL:  { code: "SAL",  texto: "Estoy a salvo" },
  AYU:  { code: "AYU",  texto: "Necesito ayuda", sos: true },
  DND:  { code: "DND",  texto: "¿Dónde están?" },
  REU:  { code: "REU",  texto: "Reunámonos en [lugar]", pideLugar: true },
  MED:  { code: "MED",  texto: "Herido, necesito médico", sos: true },

  // --- Comunidad de vecinos (suma a lo de familia) ---
  PEL:  { code: "PEL",  texto: "Peligro en la zona", sos: true },
  NREC: { code: "NREC", texto: "Necesito recurso" },
  OREC: { code: "OREC", texto: "Ofrezco recurso" },
  DESS: { code: "DESS", texto: "Persona desaparecida del sector", sos: true },

  // --- Rescate (catálogo propio) ---
  ATR:  { code: "ATR",  texto: "Atrapado", sos: true },
  DESP: { code: "DESP", texto: "Zona despejada" },
  PELE: { code: "PELE", texto: "Peligro estructural", sos: true },
  NPER: { code: "NPER", texto: "Necesito personal" },
  NEQP: { code: "NEQP", texto: "Necesito equipo" },
  VIV:  { code: "VIV",  texto: "Hallado con vida" },
  FALL: { code: "FALL", texto: "Hallado sin vida" },
};

// ---------- Catálogo por tipo de grupo ----------
export const CATALOGO_POR_TIPO: Record<TipoGrupo, string[]> = {
  FAMILIA: ["SAL", "AYU", "DND", "REU", "MED"],
  COMUNIDAD_VECINOS: ["SAL", "AYU", "DND", "REU", "MED", "PEL", "NREC", "OREC", "DESS"],
  RESCATE: ["ATR", "DESP", "PELE", "NPER", "NEQP", "VIV", "FALL"],
};

// Normaliza tipos viejos / desconocidos a uno de los tres válidos.
//   - FAMILIA_VECINOS (enum viejo) -> FAMILIA
//   - cualquier otro desconocido    -> FAMILIA (catálogo mínimo seguro)
export function normalizarTipo(tipo?: string | null): TipoGrupo {
  const t = (tipo ?? "").toUpperCase();
  if (t === "RESCATE") return "RESCATE";
  if (t === "COMUNIDAD_VECINOS") return "COMUNIDAD_VECINOS";
  // FAMILIA, FAMILIA_VECINOS (viejo) y cualquier otro caen a FAMILIA.
  return "FAMILIA";
}

// Mensajes que aplican a un tipo de grupo (en el orden del catálogo).
export function mensajesDeTipo(tipo?: string | null): Mensaje[] {
  return CATALOGO_POR_TIPO[normalizarTipo(tipo)]
    .map((c) => MENSAJES[c])
    .filter(Boolean);
}

// Etiquetas de los tres tipos para la UI.
export const TIPO_GRUPO_LABEL: Record<TipoGrupo, string> = {
  FAMILIA: "Familia",
  COMUNIDAD_VECINOS: "Comunidad de vecinos",
  RESCATE: "Rescate",
};
