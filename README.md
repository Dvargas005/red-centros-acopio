# Red de Centros de Acopio

Aplicación **marca blanca, gratuita y replicable** para coordinar donaciones y centros de acopio en una emergencia. Pensada para la respuesta a los terremotos de Venezuela (24 de junio de 2026), pero sirve para cualquier desastre.

Cuatro entradas, sin fricción:

- **Quiero donar** — anónimo. Dices qué tienes y dónde estás → te muestra los centros más cercanos.
- **Soy empresa** — donación en volumen con datos de contacto (solo visibles para el centro asignado).
- **Quiero apoyar** — voluntario registrado. Ve centros que necesitan manos + contacto del organizador.
- **Crear centro de acopio** — registra ubicación, organizador, horarios y qué necesita/sobra.

Los centros se ven entre sí: lo que a uno **le sobra** puede cubrir lo que a otro **le falta** (transferencias entre centros).

---

## Stack (todo en capa gratuita)

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | Next.js 15 (App Router) + React 19 | Serverless en Vercel, desplegable por cualquiera |
| Estilos | Tailwind, **tema oscuro por defecto** | Ahorra batería en pantallas OLED (clave con apagones) |
| Datos + Auth | **Supabase** (Postgres + Auth + RLS) | Gratis, sin servidor propio, seguridad por fila |
| Auth | Magic link por email | Sin contraseñas y **sin costo por usuario** (no como SMS/Clerk) |
| Offline | PWA + outbox en localStorage | Captura sin red y sincroniza al reconectar |

Sin backend propio. Sin DigitalOcean. Sin proveedor de pago. El frontend habla directo con Supabase y la seguridad la impone **Row Level Security** en la base de datos (por eso es seguro publicar la `anon key`).

---

## Replicar en 10 minutos

### 1. Crear proyecto Supabase (gratis)
1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Cuando esté listo, abre **SQL Editor → New query**.
3. Pega TODO el contenido de [`supabase/schema.sql`](./supabase/schema.sql) y pulsa **Run**.
   Esto crea las tablas, la función de cercanía y las políticas de seguridad.
4. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public` key

### 2. Configurar auth por email
En Supabase: **Authentication → Providers → Email** → activa **Email** (magic link viene activado por defecto). No necesitas SMTP propio para empezar; Supabase envía los correos.

### 3. Desplegar en Vercel
1. Sube este repo a GitHub.
2. En [vercel.com](https://vercel.com) → **New Project** → importa el repo.
3. En **Environment Variables** agrega:
   ```
   NEXT_PUBLIC_SUPABASE_URL   = (tu Project URL)
   NEXT_PUBLIC_SUPABASE_ANON_KEY = (tu anon key)
   ```
4. **Deploy**. Listo.

### Local
```bash
cp .env.example .env.local   # rellena las dos variables
npm install
npm run dev                  # http://localhost:3000
```

---

## ¿Se puede sincronizar SIN DATOS (por SMS)?

Sí, con el matiz correcto. **No** existe sincronización SMS automática gratis (la app no puede leer/enviar SMS sola sin un gateway de pago por usuario). Pero **sí** puede el organizador enviar una actualización puntual por SMS con un payload compacto, que se ingiere y aplica. Eso está **implementado** — ver [`docs/SMS.md`](./docs/SMS.md).

Resumen: en `/actualizar` el organizador compone un cambio ("necesito 200 botellones de agua"), la app genera un SMS de ~25 caracteres (`ACP 1 N AG 200 botellones`), lo envía desde su teléfono, y un punto de ingesta lo aplica:
- **Gratis y replicable:** Android viejo + SIM con un gateway SMS→webhook open source.
- **Sin hardware:** Twilio/Vonage (de pago).

El webhook es una Edge Function (`supabase/functions/sms-ingest`) que autoriza por número de remitente. Además, la captura normal es **offline-first** (outbox que reenvía al reconectar) y hay botones de **WhatsApp** (`wa.me`) para coordinación directa.

---

## Seguridad (importante: repo público + DB compartida)

Toda la seguridad vive en `supabase/schema.sql` vía RLS:

- El público anónimo solo lee la **vista `centros_publicos`** (sin teléfono del organizador) y puede registrar una donación.
- El teléfono del organizador y el contacto del donante solo los ve **el organizador del centro** correspondiente.
- Escribir/editar un centro o su inventario solo lo puede su organizador (`organizador_id = auth.uid()`).

No publiques nunca la `service_role` key. La `anon key` sí es pública-segura.

---

## Estado actual

Funciona end-to-end: home, donante anónimo (geolocalización + centros cercanos), empresa, login por magic link, voluntario y creación de centros. Pendiente (ver `docs/DECISIONES.md`): panel del organizador para gestionar necesidades/sobrantes y aprobar transferencias entre centros, service worker de cacheo, sync por QR.

## Licencia
Uso libre. Sin marca. Adáptalo a tu emergencia.
