# ARQUITECTURA — Malla de mensajería de emergencia

> PWA offline para comunicación en desastres mediante **grupos cerrados** y **SMS comprimido**, con **puente oportunista** que sincroniza a la web en cuanto un dispositivo de la cadena tiene datos.
> Stack: Next.js 15 (App Router) · Supabase · Tailwind (dark) · PWA. Marca blanca, gratis, replicable en Vercel.

---

## 1. El concepto: una malla que degrada con gracia

El sistema funciona en tres planos que se complementan según la conectividad disponible. Nunca hay un punto único de falla.

```
┌────────────────────────────────────────────────────────────┐
│  PLANO WEB (hay datos)                                      │
│  Tablero por grupo en tiempo real sobre Supabase.          │
│  Alertas, ubicación y estados visibles para los conectados.│
└───────────────▲──────────────────────────┬─────────────────┘
                │ sube (silencioso)         │ lee
                │                           │
┌───────────────┴───────────────────────────▼─────────────────┐
│  PUENTE OPORTUNISTA                                          │
│  El primer dispositivo de la cadena CON datos, al abrir un  │
│  mensaje en la app, lo sube a Supabase automáticamente.     │
│  De-duplicado por ID de alerta. Sin hardware dedicado.      │
└───────────────▲─────────────────────────────────────────────┘
                │ SMS comprimido (cadena humana, 1 toque/salto)
                │
┌───────────────┴─────────────────────────────────────────────┐
│  PLANO SMS (sin datos)                                       │
│  Alerta nace en un teléfono offline, viaja por SMS 1-a-1     │
│  entre miembros del grupo (lista cacheada), con TTL de       │
│  saltos para no rebotar en bucle.                            │
└──────────────────────────────────────────────────────────────┘
```

- **Con datos:** todo es web en tiempo real.
- **Sin datos:** baja a SMS en cadena entre miembros conocidos.
- **En cuanto un nodo toca señal:** la info salta de vuelta a la web para todos, sin que el portador haga nada extra.

---

## 2. Límites técnicos que el diseño asume (verificados)

1. **SMS automático es imposible en PWA, y nulo en iPhone.** Ninguna PWA lee/envía SMS sola; iOS lo prohíbe a toda app. Transporte = **SMS nativo 1-a-1** (la app prellena, la persona pulsa enviar).
2. **La difusión a un grupo = N envíos 1-a-1**, no un broadcast. La app conoce los números (lista cacheada) y arma un `sms:` por miembro.
3. **El receptor necesita la app para expandir** el mensaje (pega el texto o abre un enlace). Decodifica offline con el diccionario + lista cacheada.
4. **El puente a la nube ocurre al abrir el mensaje en la app con datos** (la PWA no corre en segundo plano). La subida es un efecto secundario gratis de leer el mensaje legible.

---

## 3. Casos de uso

**Familia / vecinos** (`FAMILIA_VECINOS`): "¿están bien los míos y dónde?". SOS con ubicación, "estoy a salvo", reportar a alguien. La cadena de SMS los conecta aunque la red esté caída; el primero con datos sube todo al tablero familiar.

**Brigada de rescate independiente** (`RESCATE`): coordinación por zonas. Despejado / peligro estructural / necesito personal, y el **ciclo de vida de la alerta** evita que dos equipos respondan lo mismo o se reporte un sector ya atendido.

---

## 4. Nomenclatura comprimida v2

Cabe en 1 segmento SMS (≤160 chars). Lleva **ID** (estados, dedup, cadena), **TTL** (mata bucles) y **ubicación** opcional.

```
RX1 <id> <op> <args...> [@lat,lng] [tN]
```

- `RX1` — prefijo + versión (la app ignora SMS ajenos).
- `<id>` — 4 chars base36. Igual id = misma alerta (se actualiza/dedup, no se duplica).
- `<op>` — `S` alerta/SOS · `E` estado · `N` necesito · `I` info/a salvo.
- `@lat,lng` — ubicación opcional (el receptor arma el link de mapa local).
- `tN` — saltos de reenvío restantes. Sin `tN` = no reenviable.

**Roles:** `V` víctima · `R` rescatista · `F` familiar · `C` centro.

**Diccionario de casos:**

| Rol | Códigos |
|---|---|
| V | `ATR` atrapado · `HER` herido · `AGU` agua · `MED` atención médica · `SAL` a salvo |
| R | `DESP` despejado · `PER` necesito personal · `EQP` necesito equipo · `VIV` hallado vivo · `FALL` hallado sin vida · `PEL` peligro estructural |
| F | `BUS` busco · `RSAL` reporto a salvo · `RHER` reporto herido · `RDES` reporto desaparecido |
| C | `NEC` necesita · `SOB` sobra · `LLE` lleno · `CER` cerrado |

**Estados (op `E`):** `ABI` abierta · `ATN` en atención · `RES` resuelta · `CAN` cancelada · `FAL` falsa alarma.

**Ejemplos:**
```
RX1 7QH2 S V ATR @10.60,-66.91 t3 piso 4   → 🆘 Víctima atrapada, piso 4, [mapa]
RX1 7QH2 E ATN                              → alerta 7QH2 EN ATENCIÓN
RX1 9KP0 S R PEL @10.59,-66.90 t2 edif Sucre→ peligro estructural, edif Sucre
```

La **identidad del emisor no viaja en el SMS**: el receptor la resuelve por el número entrante contra su lista cacheada ("SOS de **Juan**"). Ahorra caracteres y da legibilidad.

---

## 5. Modelo de datos (Supabase)

```sql
-- enums
tipo_grupo    : FAMILIA_VECINOS | RESCATE
rol_emisor    : VICTIMA | RESCATISTA | FAMILIAR | CENTRO
estado_alerta : ABIERTA | EN_ATENCION | RESUELTA | CANCELADA | FALSA_ALARMA

perfiles(id=auth.users, nombre, telefono, email, creado_en)

grupos(id, nombre, tipo, codigo char(6) unique, creador_id→perfiles, creado_en)

grupo_miembros(id, grupo_id→grupos, perfil_id→perfiles, nombre, telefono,
               unido_en, unique(grupo_id, perfil_id))

alertas(id, codigo_corto char(4) unique-per-grupo, grupo_id→grupos,
        emisor_id→perfiles, rol rol_emisor, caso, descripcion,
        lat, lng, estado estado_alerta default ABIERTA,
        creado_en, subido_en)         -- subido_en = timestamp del puente a la nube

alerta_estado_historial(id, alerta_id→alertas, estado, cambiado_por→perfiles,
                        nota, creado_en)   -- append-only
```

**Caché local (offline):** grupo activo + `grupo_miembros` (nombre+teléfono) + set de `ids` de alerta ya vistas (dedup). Las alertas creadas/recibidas offline se encolan (outbox) y suben al reconectar.

**De-duplicación en la nube:** `codigo_corto` es único por grupo → si varios portadores con datos suben la misma alerta, es la misma fila (upsert). Los cambios de estado actualizan esa fila y agregan al historial.

---

## 6. Módulos

| Spec | Módulo | Resumen |
|---|---|---|
| MSG-001 | Grupos | Crear (usuario verificado por magic link) y unirse por **código de 6** o **enlace mágico**; cachear miembros. |
| MSG-002 | Composer + SOS | Botón SOS grande, selector rol/caso, ubicación, genera SMS y envía 1-a-1 al grupo. |
| MSG-003 | Recepción + cadena | Pegar/abrir mensaje → expandir legible (nombre desde caché) → reenviar con TTL y dedup. |
| MSG-004 | Estados de alerta | Cambiar ABIERTA→EN_ATENCION→RESUELTA (o CANCELADA/FALSA_ALARMA), propagar por SMS, historial. |
| MSG-005 | Puente oportunista | Al abrir un mensaje con datos, **subir silenciosamente** a Supabase; el tablero muestra **notificación con timestamp**. |

---

## 7. Seguridad y privacidad

- **Crear grupo = autenticado** por magic link (esto es "usuario verificado").
- **La lista de miembros (con teléfonos) solo la leen miembros del grupo** — RLS scopeada a la pertenencia (`grupo_miembros.perfil_id = auth.uid()`).
- **El código de 6 es la llave** de entrada al grupo. Para grupos `RESCATE` institucionales, aprobación manual queda como mejora futura.
- **SMS es spoofable** a nivel telecom: el reconocimiento por número basta para un grupo cerrado de confianza, no es criptográfico (mejora futura: PIN por grupo).
- **Ubicación:** solo con permiso explícito; viaja únicamente dentro del grupo.
- **Tablero por grupo:** cada quien ve solo las alertas de sus grupos. Vista de coordinación cruzada = capa institucional futura.

---

## 8. Replicación (Vercel + Supabase)

1. Fork del repo → crear proyecto Supabase → correr `supabase/schema.sql`.
2. Variables en Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
3. Authentication → URL Configuration en Supabase: Site URL + Redirect URLs con el dominio de Vercel.
4. Deploy.

El **gateway SMS dedicado (Android+SIM)** del diseño anterior queda **opcional**: con el puente oportunista, cualquier miembro con datos ya sincroniza. El gateway solo suma para escenarios donde nadie de la cadena toca señal.

---

## 9. Roadmap

1. Supabase Realtime para que el tablero se actualice en vivo entre conectados.
2. Gateway que expande el SMS a texto legible para receptores sin app.
3. Aprobación manual e insignia para grupos `RESCATE`.
4. PIN por grupo (autenticidad de SMS).
5. Multi-grupo con conmutador.
6. Mapa general de coordinación (capa institucional).
