"use client";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente unico para el navegador. La seguridad la aplica RLS en la DB,
// por eso es seguro usar la anon key en el frontend.
export const supabase = createClient(url, anon);

export const CATEGORIAS = [
  "ALIMENTOS","AGUA","HIGIENE","BEBES","MEDICAMENTOS","ROPA","LIMPIEZA","HERRAMIENTAS","OTRO",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];
