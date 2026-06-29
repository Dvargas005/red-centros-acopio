# Bitácora de módulos RX1 — verificación manual pendiente

> Esta app usa sesiones **anónimas** de Supabase (auth.uid() válido) y RLS por
> `es_miembro(grupo_id)`. Yo (Claude) **no puedo** ejecutar SQL ni probar en
> navegador / SMS / con dos dispositivos. Esta es tu lista de tareas.

---

# PIVOTE — offline-first + UX (lo que debes probar ahora)

> Build verde ✅. Todo lo de abajo es verificación manual tuya.

## 0) MIGRACIÓN DE BASE DE DATOS (CRÍTICO, hacer primero)
El enum `tipo_grupo` cambió de `('FAMILIA_VECINOS','RESCATE')` a
`('FAMILIA','COMUNIDAD_VECINOS','RESCATE')`.

- **Base nueva**: corre `supabase/schema.sql` completo; ya crea el enum con los
  tres valores.
- **Base existente** (ya tenía el enum viejo): ejecuta en el **SQL Editor**,
  como sentencias sueltas (no dentro de una transacción):
  ```sql
  alter type tipo_grupo rename value 'FAMILIA_VECINOS' to 'FAMILIA';
  alter type tipo_grupo add value if not exists 'COMUNIDAD_VECINOS';
  ```
  Las filas viejas `FAMILIA_VECINOS` quedan como `FAMILIA`. (También está como
  comentario en `supabase/schema.sql`.)

## 1) OFFLINE REAL (service worker) — `public/sw.js` + `components/ClientBoot.tsx`
El SW solo se registra en **producción** (para no romper el HMR de `next dev`).
Cómo probar:
1. `npm run build && npm start` y abre http://localhost:3000.
2. Navega por las pantallas (inicio, mi grupo, enviar mensaje, leer) **con red**
   una vez, para que el app shell quede cacheado.
3. DevTools → Application → Service Workers: confirma `sw.js` "activated".
4. DevTools → Network → **Offline** (o apaga el wifi) y **recarga**: la app debe
   ABRIR igual. Debes poder leer el grupo y miembros cacheados, ver el tablero
   de alertas (desde caché local) y componer un mensaje.
5. Visita una ruta no cacheada estando offline → debe caer a la página
   **/offline** (fallback), no al dino del navegador.

## 2) SMS LEGIBLE PLANO — `lib/sms-protocol.ts`
El SMS ya NO es `RX1 ...` cifrado: ahora es texto humano. Ejemplos reales que
genera la app:
```
SOS - Juan - ATRAPADO - piso 4 - https://maps.google.com/?q=10.601,-66.934 - [7g2k #ATR t3 g:Familia Perez]
AVISO - Ana - ESTOY A SALVO - [9a1z #SAL g:Familia Perez]
ACTUALIZACION - Luis - RESUELTA - [7g2k e:RES g:Familia Perez]
```
- [ ] Crea un mensaje y confirma que el cuerpo se entiende **sin la app**.
- [ ] El corchete final `[...]` lleva el id corto (de-dup) + códigos.
- [ ] En **Leer un mensaje**, pega uno de esos textos (prueba también en
      MAYÚSCULAS/minúsculas: el decode es **case-insensitive**) y confirma que lo
      lee bien (caso, nota, mapa, estado) y deduplica.

## 3) SYNC OPORTUNISTA — `lib/sync.ts` (cableado en `ClientBoot`)
Las alertas creadas/recibidas offline suben solas a Supabase, sin que toques
nada. Dispara: al **abrir la app** y al evento **'online'** (reconectar).
- [ ] Estando offline, crea 1–2 mensajes (quedan en cola / outbox).
- [ ] Reactiva la red. Sin recargar ni tocar botones, en segundos deben subir.
      Confírmalo en Supabase (tabla `alertas`).
- [ ] **No se duplican**: el upsert usa `onConflict (grupo_id, codigo_corto)`.
      Reenvía/recibe el mismo mensaje y verifica que sigue siendo 1 fila.

## 4) BOTÓN SOS SEPARADO — dos rutas distintas
Rutas por flujo (ya NO comparten pantalla):
- **🆘 SOS — Pedir auxilio** → `app/alertas/sos/page.tsx` (**ruta `/alertas/sos`**):
  pantalla de UN paso. Al entrar **preselecciona el caso** según el tipo
  (FAMILIA/COMUNIDAD_VECINOS → "Necesito ayuda"; RESCATE → "Atrapado"),
  **captura la ubicación automáticamente** (si la niegan, sigue sin coords y
  avisa), nota opcional, y botón rojo "Preparar SOS para el grupo".
- **✉️ Enviar mensaje al grupo** → `app/alertas/nueva/page.tsx`
  (**ruta `/alertas/nueva`**): composer general, elige caso del catálogo del
  tipo, **sin preselección** de emergencia.

- [ ] En inicio y en "Mi grupo": el botón rojo **🆘 SOS** abre `/alertas/sos`
      (un paso, caso ya elegido, pide ubicación al entrar). El **✉️ Enviar
      mensaje** abre `/alertas/nueva` (composer general).
- [ ] Confirma que el botón SOS **no** cae en el composer general y que "Enviar
      mensaje" **no** cae en el flujo SOS.
- [ ] En `/alertas/sos`, prueba negar el permiso de ubicación: debe seguir
      permitiendo preparar el SOS sin coordenadas, con aviso.
- [ ] En grupo de RESCATE el SOS viene como "Atrapado"; en familia/vecinos como
      "Necesito ayuda". Puedes cambiarlo con las chips de auxilio.

## 4b) CREAR GRUPO: tipo como primer paso — `app/grupos/crear/page.tsx`
- [ ] El **tipo** se elige PRIMERO, como tabs horizontales; el activo se ve con
      fondo accent / texto negro y los demás atenuados.
- [ ] **Nada preseleccionado** al entrar: el resto del formulario (nombre,
      datos) está atenuado/deshabilitado con el hint "Elige el tipo de grupo
      para continuar" hasta tocar una tab.
- [ ] Los campos (nombre, tu nombre, teléfono) son iguales para los tres tipos.

## 5) NORMALIZACIÓN DE TELÉFONO — `normalizarTelVE` en `lib/sms-protocol.ts`
En crear y unirse, placeholder `Ej: +58 412 1234567` + texto de ayuda. No
bloquea por formato; normaliza antes de guardar. Casos verificados:
```
0412 123 4567   -> +584121234567
412-1234567     -> +584121234567
+58 0412 1234567-> +584121234567
04141112233     -> +584141112233
+1 305 5551234  -> +13055551234   (respeta código internacional)
```
- [ ] Crea/únete con el número en varios formatos y confirma que en Supabase
      (`perfiles.telefono`, `grupo_miembros.telefono`) queda consistente.

## 6) TRES TIPOS DE GRUPO — `app/grupos/crear` + `lib/catalogo.ts`
- [ ] Al crear, hay **tres** opciones: Familia, Comunidad de vecinos, Rescate.
- [ ] El tipo se guarda y "Mi grupo" muestra la etiqueta correcta.

## 7) CATÁLOGO POR TIPO — `lib/catalogo.ts` (composer `app/alertas/nueva`)
El composer muestra SOLO los mensajes del tipo del grupo activo:
- **FAMILIA**: Estoy a salvo · Necesito ayuda · ¿Dónde están? · Reunámonos en
  [lugar] · Herido, necesito médico.
- **COMUNIDAD_VECINOS**: lo de familia + Peligro en la zona · Necesito recurso ·
  Ofrezco recurso · Persona desaparecida del sector.
- **RESCATE**: Atrapado · Zona despejada · Peligro estructural · Necesito
  personal · Necesito equipo · Hallado con vida · Hallado sin vida.
- [ ] Crea un grupo de cada tipo y confirma que el composer ofrece exactamente
      esos mensajes (y que en familia **no** aparece la palabra "víctima").
- [ ] "Reunámonos en [lugar]" pide el lugar y lo incrusta en el texto legible.

> Pendiente para un prompt posterior (NO implementado ahora, por decisión):
> "mensajes personalizados con código" y "checks de quién está al tanto".

---

# (Histórico) Bitácora de módulos RX1 anteriores

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
**Construido:**
- `app/leer/page.tsx`: pega el SMS (o `?m=` en la URL) → `decodeSms` → muestra
  rol + caso legible + nota + "Ver en mapa" + "hace cuánto" + saltos restantes.
- Campo opcional "¿de qué número llegó?" → `buscarMiembroPorTel`; si vacío o
  desconocido → "remitente desconocido".
- Dedup con `alertaYaVista(id)`: si ya se vio y el estado no cambió →
  "Ya recibiste esta alerta"; si cambió (op E con estado distinto) → actualiza.
- Reenvío en cadena: si `decrementarTTL` devuelve texto (TTL>1) muestra enlaces
  `sms:` por miembro con el TTL decrementado; a TTL agotado no ofrece reenvío.
- Enlaces a `/leer` desde home y `/grupos/mi`.

**DECISIÓN DE UX PENDIENTE (no la tomo yo):**
- [ ] **Identidad del remitente en el flujo de pegado.** Un SMS pegado NO trae el
      número del remitente, así que por defecto queda "remitente desconocido"
      salvo que el receptor escriba el número a mano. ¿Cómo resolver identidad de
      forma fiable? Opciones a decidir: (a) pedir que el emisor incluya su número
      en el cuerpo del RX1; (b) un id de emisor corto en el protocolo; (c)
      aceptar "desconocido" como estado normal. **Requiere tu decisión de producto.**

**Supuestos tomados:**
- El SMS no incluye marca de tiempo; "hace cuánto" usa el `creado_en` que se fija
  localmente la primera vez que se registra la alerta (si no, "recién recibido").

**Verificar manualmente (navegador / 2 dispositivos):**
- [ ] Pegar un RX1 de alerta (S) y uno de estado (E); confirmar lectura legible,
      mapa, dedup y que el reenvío decrementa el TTL.
- [ ] Probar el flujo real por SMS entre dos teléfonos (requiere 2 dispositivos).

## MSG-005 — Puente oportunista
**Construido:**
- En `app/leer`: al registrar una alerta, si hay conexión y sesión de miembro,
  se sube a la nube en silencio. Contenido (S/N/I) → `upsertAlertaContenido`
  (onConflict `grupo_id,codigo_corto`, no duplica, setea `subido_en`, no toca
  estado). Estado (E) → `cambiarEstado` (+ historial). Falla en silencio si RLS
  rechaza por no-miembro o no hay red; la UI no se rompe.
- En `app/grupos/mi`: al cargar se traen las alertas del grupo desde la nube, se
  cachean y se calcula si hay actividad nueva desde la última visita →
  **notificación con timestamp** ("🔔 Nueva actividad en el grupo · hace X").

**Supuestos / límites:**
- Sin Realtime: la notificación se evalúa al ENTRAR a `/grupos/mi` (no en vivo).
  Para "entra/actualiza en vivo" se necesitaría suscripción Realtime — pendiente.
- "Última visita" se guarda en localStorage por grupo; si no hay localStorage, la
  notificación no persiste entre visitas.

**Verificar manualmente (2 dispositivos / navegador):**
- [ ] Dispositivo A crea/lee alerta → Dispositivo B (miembro) abre `/grupos/mi` y
      ve la alerta y la notificación de actividad nueva.
- [ ] Confirmar en Supabase que NO se duplican filas (mismo `grupo_id,codigo_corto`).
- [ ] Confirmar que un NO-miembro no logra escribir (RLS) y que la UI no se rompe.

## MSG-004 — Estados + tablero por grupo
**Construido (en `app/grupos/mi`):**
- Tablero de alertas del grupo (de la nube si hay datos; offline desde caché +
  recibidas). Cada alerta muestra descripción legible, timestamp y badge de
  estado con color: ABIERTA rojo, EN_ATENCION naranja, RESUELTA verde,
  CANCELADA/FALSA_ALARMA gris.
- Al expandir una alerta: enlace "Ver en mapa" (si hay coords), botones de
  estado ('Voy en camino' → EN_ATENCION, 'Resuelta', 'Cancelar', 'Falsa alarma'),
  e historial de estado.
- Cada cambio de estado: genera el SMS `RX1 <id> E <estado>` para difundir al
  grupo (enlaces `sms:` por miembro) Y, si hay datos, actualiza `alertas.estado`
  e inserta una fila en `alerta_estado_historial` (vía `cambiarEstado`).

**Supuestos / límites:**
- El "color naranja" de EN_ATENCION usa el token `accent` (#ff6b35) de la paleta.
- El historial se carga al expandir (requiere conexión); offline muestra aviso.

**Verificar manualmente (navegador / 2 dispositivos):**
- [ ] Cambiar estado de una alerta y confirmar: color del badge, fila nueva en
      `alerta_estado_historial`, y que aparecen los enlaces SMS de difusión.
- [ ] Confirmar que el tablero se ve correcto offline (desde caché).

---

# RESUMEN — qué debes verificar/ejecutar tú (en orden)
1. [ ] **Esquema**: confirmar que `supabase/schema.sql` está aplicado completo en el
       proyecto Supabase (incluye tablas `alertas`/`alerta_estado_historial`, la
       función `es_miembro` y los grants). **No hay SQL nuevo** en MSG-002..005.
2. [ ] **Anonymous sign-ins**: confirmar que está habilitado (ya lo activaste).
3. [ ] **Env vars** en el despliegue: `NEXT_PUBLIC_SUPABASE_URL`,
       `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
4. [ ] **Flujo composer (MSG-002)** en navegador: crear alerta con/sin ubicación;
       ver fila en `alertas`; probar offline (DevTools) → outbox.
5. [ ] **Flujo lectura (MSG-003)**: pegar RX1 de alerta y de estado; dedup; reenvío
       que decrementa TTL.
6. [ ] **DECISIÓN DE PRODUCTO (MSG-003)**: cómo resolver la identidad del remitente
       en el pegado (ver sección MSG-003). **Pendiente de tu decisión.**
7. [ ] **Puente + notificación (MSG-005)** con 2 dispositivos/cuentas: A escribe,
       B (miembro) ve la alerta y la notificación; sin duplicados; no-miembro
       bloqueado por RLS sin romper UI.
8. [ ] **Estados + historial (MSG-004)**: cambiar estado, ver color e historial,
       difundir por SMS.
9. [ ] **Outbox**: hoy se encola sin red, pero el *flush* automático al reconectar
       NO está cableado a una pantalla. Decidir dónde dispararlo (p. ej. al abrir
       `/grupos/mi` online). **Pendiente.**
10. [ ] **SMS real** entre teléfonos (requiere 2 dispositivos) — no verificable por mí.
11. [ ] **Tiempo real**: la notificación es al entrar a `/grupos/mi`, no en vivo.
        Si se quiere en vivo, agregar Supabase Realtime. **Pendiente de decisión.**

## Estado de build/commit por módulo
- MSG-002: build verde ✅ · commit+push ✅
- MSG-003: build verde ✅ · commit+push ✅
- MSG-005: build verde ✅ · commit+push ✅
- MSG-004: build verde ✅ · commit+push ✅
