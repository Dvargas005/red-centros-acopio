# Decisiones de arquitectura

Este documento responde, uno por uno, a los requisitos que definieron el rediseño. Es el "porqué" detrás del código.

## Contexto

Doble terremoto en Venezuela el 24 de junio de 2026 (Mw 7.2 y 7.5, epicentros San Felipe/Yumare; La Guaira y Caracas declaradas zona de desastre). Apagones, escasez de agua y alimentos, y centros de acopio improvisados (vecindarios, embajadas) que necesitan coordinarse. Esas condiciones de campo —no la teoría— mandan en cada decisión.

---

## 1. Batería / Carbon g10

**Pedido:** Carbon g10 es claro y consume más batería.

**Decisión:** se elimina IBM Carbon. UI propia con Tailwind y **tema oscuro por defecto** (`color-scheme: dark`, fondo `#0b0f14`). En pantallas OLED los píxeles oscuros consumen mucho menos — relevante cuando hay apagones y la carga es un recurso escaso. Bonus: Carbon es una dependencia pesada que contradice "replicable y ligero".

## 2. Sincronizar sin datos / SMS

**Pedido:** ¿se puede sincronizar por SMS?

**Decisión:** SMS automático **no** sin un gateway de pago (Twilio/Vonage) — rompe gratuito y replicable, y un PWA no puede leer/enviar SMS solo. En su lugar:
- **Offline-first**: outbox en `localStorage` (`lib/offline.ts`) que reenvía al reconectar.
- **WhatsApp deep-link** (`wa.me`) al organizador — mínimo consumo, ubicuo en Venezuela.
- **`sms:` deep-link** como respaldo manual humano-en-el-medio.
- **QR offline** entre teléfonos — roadmap.

Detalle completo en el README, sección "¿Se puede sincronizar sin datos?".

## 3. Auth gratuito (Clerk cobra tras 20 cuentas)

**Pedido:** Clerk no sirve; será gratuito y el repo se comparte.

**Decisión:** fuera Clerk. **Supabase Auth con magic link por email** — gratis, sin tope de 20, sin contraseñas, sin costo por SMS. Los flujos de **donar** y **empresa** ni siquiera requieren cuenta (anónimos). Solo **apoyar** y **crear centro** piden login.

## 4. Serverless / replicable en Vercel

**Pedido:** serverless en lo posible, replicable por cualquiera.

**Decisión:** Next.js (App Router) en Vercel + Supabase como única dependencia de datos. No hay servidor Express ni infraestructura propia. El frontend habla directo con Supabase; RLS impone la seguridad. Replicar = fork → crear proyecto Supabase → correr `schema.sql` → 2 variables de entorno → deploy.

## 5. Sin multitenant / visibilidad entre centros

**Pedido:** nada de multitenant; los centros deben verse entre sí y poder pedir/enviar excedentes.

**Decisión:** una sola red compartida. Modelo:
- `centros` — todos visibles entre sí.
- `items_centro` con `tipo = NECESITA | SOBRA` — cada centro publica su déficit y su excedente.
- `transferencias` — un centro con SOBRA cubre la NECESITA de otro; estados `ABIERTA → ACEPTADA → EN_CAMINO → COMPLETADA`.

Así, lo que a un centro le sobra se canaliza a quien le falta, sin aislamiento por tenant.

## 6. Idioma español / contexto terremoto

**Decisión:** toda la UI en español (esto reemplaza la regla "inglés" de Vector TMS — es otro producto, otro público). Campos geográficos pensados para Venezuela (`estado_geo`: La Guaira, Yaracuy, Distrito Capital…).

## 7. Roles simples

**Decisión:**

| Entrada | Auth | Captura | Recibe |
|---|---|---|---|
| Quiero donar | Anónimo (contacto oculto) | Qué dona + ubicación | Lista de centros cercanos |
| Soy empresa | Anónimo + datos | Empresa, contacto, volumen, ubicación | Centros sugeridos para coordinar |
| Quiero apoyar | Login magic link | Perfil completo | Centros que necesitan manos + contacto del organizador |
| Crear centro | Login magic link | Dirección, organizador, horarios, ubicación | Su centro publicado en la red |

## 8. Marca blanca / listo para repo

**Decisión:** sin nombre ni logo. README con guía de replicación paso a paso en Vercel + Supabase. `manifest.webmanifest` con placeholders de ícono que el replicador sustituye.

---

## Omitido a propósito

Todo lo relativo a **protección/cuidado de menores** queda fuera de este producto. Es un caso más delicado (datos de menores, custodia, control de retiro) que merece su propio diseño, su propia revisión de privacidad y probablemente su propio repositorio. No se mezcla aquí.

---

## Roadmap (siguiente iteración)

1. **Panel del organizador**: gestionar `items_centro` (necesita/sobra), ver donaciones entrantes, aprobar transferencias. Hoy las tablas y RLS ya lo soportan; falta la UI.
2. **Vista de red**: mapa/lista de necesidades y excedentes entre todos los centros, con matching automático NECESITA↔SOBRA.
3. **Service worker** para cachear el shell y la lista de centros (browse offline real).
4. **Sync por QR** entre teléfonos sin datos.
5. **Migrar la outbox** de `localStorage` a IndexedDB (`idb`) si crece el volumen.
