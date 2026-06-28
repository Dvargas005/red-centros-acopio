"use client";
// Cola de salida (outbox) para operar SIN DATOS.
// Guarda envios pendientes en localStorage y los reenvia cuando vuelve la conexion.
// Para v1 cubre el caso principal: registrar donaciones/items sin red y sincronizar al reconectar.
// (Para datasets grandes, migrar a IndexedDB con la libreria 'idb'.)

type PendingOp = { id: string; table: string; payload: Record<string, unknown>; ts: number };
const KEY = "acopio_outbox_v1";

function read(): PendingOp[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
function write(ops: PendingOp[]): boolean {
  // En modo privado o con storage lleno, setItem lanza. No debe romper el flujo.
  try { localStorage.setItem(KEY, JSON.stringify(ops)); return true; } catch { return false; }
}

// Devuelve true si se pudo guardar; false si localStorage no está disponible.
export function enqueue(table: string, payload: Record<string, unknown>): boolean {
  try {
    const ops = read();
    ops.push({ id: crypto.randomUUID(), table, payload, ts: Date.now() });
    return write(ops);
  } catch {
    return false;
  }
}

export function pendingCount(): number { return read().length; }

// Recibe una funcion que sabe insertar en Supabase; se llama al reconectar.
export async function flush(
  insert: (table: string, payload: Record<string, unknown>) => Promise<{ error: unknown }>
) {
  try {
    const ops = read();
    const remaining: PendingOp[] = [];
    for (const op of ops) {
      const { error } = await insert(op.table, op.payload);
      if (error) remaining.push(op); // si falla, se reintenta luego
    }
    write(remaining);
    return ops.length - remaining.length;
  } catch {
    return 0;
  }
}
