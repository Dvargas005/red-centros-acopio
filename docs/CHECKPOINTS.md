# Bitácora de módulos RX1 — verificación manual pendiente

> Esta app usa sesiones **anónimas** de Supabase (auth.uid() válido) y RLS por
> `es_miembro(grupo_id)`. Yo (Claude) **no puedo** ejecutar SQL ni probar en
> navegador / SMS / con dos dispositivos. Esta es tu lista de tareas.

## Estado de SQL del esquema (CRÍTICO)
- [ ] **Confirmar que `supabase/schema.sql` está aplicado** en el proyecto Supabase.
      Los módulos MSG-002..005 **no requieren SQL nuevo**: usan las tablas
      `alertas` y `alerta_estado_historial` y sus políticas RLS que ya están en
      `supabase/schema.sql`. Si ese archivo aún NO se corrió completo en este
      proyecto, córrelo (SQL Editor) antes de probar.
- **No hay SQL PENDIENTE DE EJECUTAR nuevo en estos módulos.** (Si en el futuro
  se agrega una RPC de puente, se documentará aquí con el SQL exacto.)

---

## MSG-002 — Composer + SOS
**Construido:**
- `app/alertas/nueva/page.tsx`: selector de rol (V/R/F/C) → casos del diccionario
  → nota opcional → "Adjuntar mi ubicación" (geolocation, opcional). Genera el
  string RX1 con `generarId()` + `t3`. Con datos: `upsertAlertaContenido` (estado
  cae a ABIERTA por default). Sin datos / error: encola en outbox (`lib/offline`)
  y marca el id como visto. Guarda la alerta en caché local siempre.
- Botón SOS grande en home (`app/page.tsx`) y en `/grupos/mi` → `/alertas/nueva`.
- Pantalla de difusión: muestra el RX1 y un enlace `sms:` prellenado por miembro.
- `lib/alertas.ts` (nuevo): modelo de estados, colores, helpers de DB y presentación.
- `lib/cache.ts`: `guardarAlertaLocal` / `leerAlertasLocales` / `actualizarEstadoLocal`.

**Supuestos tomados:**
- El perfil del emisor (`perfiles.id = auth.uid()`) ya existe porque se crea al
  crear/unirse a un grupo; `alertas.emisor_id` depende de esa FK.
- `estado` se omite a propósito en el upsert de contenido para no "regresar" el
  estado de una alerta ya avanzada (ver cabecera de `lib/alertas.ts`).

**Verificar manualmente (navegador):**
- [ ] Crear una alerta como Víctima/Atrapado con y sin ubicación; confirmar que el
      string RX1 cabe en ≤160 y que aparecen los enlaces `sms:` por miembro.
- [ ] Confirmar que la fila aparece en `alertas` en Supabase (online) con estado ABIERTA.
- [ ] Probar sin conexión (DevTools offline): debe encolar y seguir ofreciendo SMS.

---

## MSG-003 — Recepción + cadena
(pendiente de construir)

## MSG-005 — Puente oportunista
(pendiente de construir)

## MSG-004 — Estados + tablero por grupo
(pendiente de construir)
