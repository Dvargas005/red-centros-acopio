"use client";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// True solo si ambas variables estan presentes. Permite avisar en la UI y evita
// asumir que las consultas funcionaran cuando el entorno no esta configurado.
export const supabaseConfigured = url !== "" && anon !== "";

// Cliente unico para el navegador. La seguridad la aplica RLS en la DB,
// por eso es seguro usar la anon key en el frontend.
// Si faltan las env vars usamos placeholders inertes para no lanzar al importar
// (p. ej. durante el build sin variables); las llamadas reales fallaran en runtime.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anon || "placeholder-anon-key"
);

// Garantiza una sesión utilizable sin fricción: reutiliza la sesión actual
// (anónima o con correo) o crea una anónima silenciosa. Devuelve el uid.
// Las políticas RLS funcionan con auth.uid(); una sesión anónima tiene uid
// válido, así que no hay que tocar el esquema. Lanza un Error en español si
// el proveedor anónimo no está habilitado en Supabase.
export async function asegurarSesion(): Promise<string> {
  // getSession() lee la sesión desde storage: es rápido y NO compite por el
  // lock de validación de auth como getUser(), que puede quedarse colgado al
  // arranque (junto a la emisión de INITIAL_SESSION de onAuthStateChange) y
  // dejar la promesa sin resolver → userId nunca se setea.
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(
      "No se pudo iniciar sesión anónima; verifica la configuración (habilita 'Anonymous sign-ins' en Supabase)."
    );
  }
  return data.user.id;
}

export const CATEGORIAS = [
  "ALIMENTOS","AGUA","HIGIENE","BEBES","MEDICAMENTOS","ROPA","LIMPIEZA","HERRAMIENTAS","OTRO",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];
