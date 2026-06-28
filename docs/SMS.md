# Actualizaciones por SMS (sin datos)

Permite que un organizador actualice su centro **sin conexión de datos**, enviando un SMS con un payload compacto. La app lo prellena, el organizador pulsa enviar, y un webhook lo aplica a la base.

## El flujo

```
[Organizador sin datos]
      │  compone en /actualizar  →  SMS prellenado (sms:)
      ▼
[Su teléfono envía un SMS normal]
      │
      ▼
[Punto de ingesta]  ── Android+SIM con gateway  ó  Twilio/Vonage
      │  POST { from, text }  + header x-ingest-secret
      ▼
[Edge Function sms-ingest]  → decodifica, autoriza por número, escribe en Supabase
```

## Protocolo (cabe en 1 SMS, ~12–35 caracteres)

```
ACP <ver> <op> [@CODIGO] <args>
```

| Op | Significado | Ejemplo | Decodifica a |
|---|---|---|---|
| `N` | Necesita | `ACP 1 N AG 200 botellones` | `{op:"NECESITA", categoria:"AGUA", cantidad:200, descripcion:"botellones"}` |
| `S` | Sobra | `ACP 1 S AL 30 cajas de atun` | `{op:"SOBRA", categoria:"ALIMENTOS", cantidad:30, descripcion:"cajas de atun"}` |
| `E` | Estado del centro | `ACP 1 E LLENO` | `{op:"ESTADO", estado:"LLENO"}` |
| `R` | Resolver item | `ACP 1 R N AG` | `{op:"RESOLVER", tipo:"NECESITA", categoria:"AGUA"}` |

Códigos de categoría: `AL AG HI BB MD RO LI HE OT`.
Es la "especie de JSON" pedida: tokenizado para ahorrar caracteres, pero decodifica 1:1 a un objeto. Tan simple que incluso se puede teclear a mano.

El encoder/decoder vive en `lib/sms-protocol.ts` (app) y se replica dentro de `supabase/functions/sms-ingest/index.ts` (Deno).

## Montar el punto de ingesta

### Opción A — Gratis y replicable (recomendada): Android + SIM

1. Un teléfono Android viejo con una SIM con plan de SMS, en el centro de coordinación.
2. Instala un gateway SMS→webhook open source (p.ej. **android-sms-gateway** / *SMS Forwarder* / *httpSMS*).
3. Configúralo para que, ante cada SMS entrante, haga:
   ```
   POST https://TU-PROYECTO.supabase.co/functions/v1/sms-ingest
   Header: x-ingest-secret: <SMS_INGEST_SECRET>
   Body:   { "from": "{sender}", "text": "{message}" }
   ```
   (las plantillas `{sender}`/`{message}` dependen de la app que elijas)

Costo recurrente: solo la SIM. Sin número de pago, sin gateway comercial.

### Opción B — Sin hardware: Twilio (de pago)

1. Compra un número en Twilio que reciba SMS.
2. En el webhook de "A Message Comes In", apunta a la Edge Function. Twilio envía `From` y `Body`; usa un Function/proxy mínimo que reempaquete a `{from, text}` y agregue el header `x-ingest-secret`.

## Desplegar la Edge Function

```bash
supabase functions deploy sms-ingest --no-verify-jwt
supabase secrets set SMS_INGEST_SECRET=algo-largo-y-secreto
# SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya existen en el entorno de Functions
```

En Vercel agrega también:
```
NEXT_PUBLIC_SMS_INGEST_NUMBER = +58XXXXXXXXXX   # el numero de la SIM/Twilio
```

## Seguridad y límites (honesto)

- La Edge Function usa `service_role` (salta RLS), por eso **autoriza ella misma**: solo aplica el cambio si el número remitente coincide con `organizador_telefono` de un centro. RLS no protege aquí.
- El `x-ingest-secret` evita que cualquiera POSTee a la función fingiendo ser el gateway.
- **El SMS es spoofable** a nivel telecom (se puede falsificar el remitente). Para este contexto, vincular al número del organizador es razonable; si se necesita más, añadir un PIN corto rotativo al mensaje (`ACP 1 N AG 200 ... #4821`) — roadmap.
- Límite de 160 caracteres por segmento. El protocolo está pensado para no pasarlo.
- Multi-centro por un mismo organizador: v1 usa el primer centro. Para varios, añadir columna `centros.codigo` y usar `@CODIGO` (roadmap).

## Qué NO es esto

No es sincronización SMS automática de la app (eso necesitaría que la app leyera/enviara SMS sola → gateway de pago por usuario). Esto es **el usuario enviando una actualización puntual por SMS**, que es justo lo que se pidió y se resuelve gratis con la Opción A.
