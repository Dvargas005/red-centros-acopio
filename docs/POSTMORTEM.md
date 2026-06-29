# Postmortem — Malla de mensajería de emergencia

> Estado: **demo funcional, no llevado a producción real.**
> Escrito para desarrolladores que quieran retomar la idea, la arquitectura o partes del repo.
> Junio 2026.

---

## Por qué empezó

Tras el terremoto del 24 de junio de 2026 en Venezuela (epicentros en Yaracuy, con La Guaira y Caracas como zonas más golpeadas), pasó lo de siempre en un desastre: **la red de datos se cayó, pero la gente seguía necesitando saber si sus familiares estaban bien.** En La Guaira hubo familias que no lograban comunicarse porque dependían de WhatsApp/internet, y cuando eso no está, no queda nada.

La idea inicial era simple de enunciar: **¿y si pudiéramos actualizar un sitio web por SMS?** Un familiar sin datos manda un mensaje de texto, y eso aparece en una web que el resto de la familia (con o sin datos) puede ver. SMS funciona cuando los datos no, así que parecía el canal correcto para degradar con gracia.

De ahí creció a algo más ambicioso: una "malla" de mensajería donde grupos cerrados (familia, vecinos, brigadas de rescate) se pasaran alertas comprimidas por SMS en cadena, con estados, ubicación, y sincronización oportunista a la nube.

---

## La hipótesis

Que se podía construir una **PWA gratuita y replicable** que funcionara como malla de comunicación en desastres:

- Grupos cerrados con lista de miembros cacheada localmente.
- Alertas (SOS, "a salvo", "necesito X") que viajaran por **SMS comprimido** cuando no hubiera datos.
- Una **cadena humana**: el mensaje salta de teléfono a teléfono por SMS hasta encontrar uno con conexión.
- Un **puente oportunista**: el primer dispositivo de la cadena con datos sube todo a la web, y de ahí es visible para los conectados.
- Todo sin servidores propios ni costo: Next.js en Vercel + Supabase.

En papel, era una malla que degradaba con gracia: web en tiempo real con datos, SMS en cadena sin ellos, y reconciliación automática en cuanto alguien tocara señal.

---

## El muro (lo que de verdad importa de este documento)

La hipótesis chocó contra límites que **ningún código nuestro podía derribar**. Si retomas esto, empieza por aquí, porque es donde se nos fue la idea:

### 1. Una PWA no puede enviar ni recibir SMS por su cuenta

- **Enviar:** lo máximo que puede hacer una web es abrir el SMS nativo prellenado (`sms:?body=...`). El usuario tiene que **pulsar enviar manualmente**, uno por cada destinatario. No hay envío programático.
- **Recibir:** una PWA **no puede leer** los SMS entrantes. La única vía es que el usuario **copie y pegue** el mensaje en la app para que ésta lo interprete.
- **WebOTP** (la API que parece la salvación) solo lee un SMS de formato rígido, numérico, en Chrome/Android, y solo mientras un formulario lo está esperando. Inútil para mensajes generales.

### 2. En iPhone es directamente imposible

Todo lo anterior, en iOS, ni siquiera con app nativa. Apple no permite a ninguna app leer ni enviar SMS programáticamente. La mitad de los usuarios quedan fuera de cualquier automatización por diseño del sistema operativo.

### 3. SMS no tiene acuse de recibo ni de lectura

No hay "✓✓ recibido / leído" como en WhatsApp. Una vez que mandas un SMS, **estás ciego**: no sabes si llegó. Esto mata cualquier lógica de "reenviar si no lo recibió", porque no hay forma de saber si lo recibió.

### 4. La fricción humana es el verdadero asesino

Junta todo lo anterior y ponlo en una persona real, en pánico, con el teléfono al 10% de batería, en un terremoto:

> "Abre la app. Pega el mensaje que te llegó. Léelo. Ahora reenvíalo tocando 'enviar' seis veces, una por cada miembro del grupo."

**No va a pasar.** El punto de inflexión del proyecto fue darse cuenta de que el sistema dependía de **inputs manuales del usuario en el peor momento posible para pedirle inputs manuales.** La elegancia de la malla en papel no sobrevive al contacto con una emergencia real.

---

## El pivote

Aceptado el muro, el transporte cambió de filosofía:

**De:** malla SMS en cadena con nomenclatura comprimida y pegado manual.
**A:** **offline-first con sincronización oportunista**, y SMS como botón de pánico de último recurso.

Concretamente:

- La app es **offline-first de verdad** (service worker que cachea el shell): abre y opera sin conexión, lee el grupo cacheado, compone mensajes.
- Cuando hay **cualquier** ventana de datos (2G, un wifi momentáneo), el outbox **sincroniza solo** con Supabase, sin que el usuario haga nada. Aprovecha cada respiro de conectividad.
- El SMS dejó de ser "el sistema" y pasó a ser **un botón manual de último recurso**: si estás totalmente aislado, manda **un** mensaje de **texto legible plano** (no comprimido, lo entiende cualquiera sin la app) a un contacto.
- Los mensajes se volvieron **legibles** (`SOS - Juan - ATRAPADO - piso 4 - <link mapa>`) en vez de crípticos (`RX1 7QH2 S V ATR...`), porque la compresión solo tenía sentido para la malla que abandonamos.

Este pivote es más humilde y **mucho más robusto en manos reales.** Asume que la conectividad en un desastre es *intermitente*, no *nula* — que suele ser cierto — y exprime cada ventana automáticamente, sin pedirle al usuario que haga de router humano.

---

## Qué quedó funcionando (demo)

- Grupos cerrados de tres tipos (**Familia**, **Comunidad de vecinos**, **Rescate**), con entrada por **código de 6** o **enlace mágico**.
- **Sesiones anónimas** (sin fricción de registro): entras con nombre + teléfono; el correo es opcional para recuperar identidad.
- **Catálogo de mensajes por tipo de grupo** (una familia no emite "víctima atrapada"; una brigada sí).
- **Botón SOS** de un solo paso, separado del mensaje normal, con captura de ubicación automática.
- **Alertas con ciclo de vida** (abierta → en atención → resuelta) e historial.
- **Tablero por grupo** con estados y colores.
- **PWA offline real** + **sync oportunista** automático al reconectar.
- **SMS de respaldo en texto legible plano.**
- Base de datos **Supabase con RLS por pertenencia** a grupo, y **`schema.sql` reproducible desde cero** (probado: clonar + correr el archivo levanta una base funcional).

## Qué NO funciona / no se hizo

- **No es una malla SMS automática.** El SMS sigue exigiendo que el usuario pulse enviar. No hay recepción automática.
- **No se probó con usuarios reales** en una emergencia. Quedó en demo.
- **Sin acuse de recibo** en el plano SMS (imposible).
- Quedaron sin implementar: mensajes personalizados por grupo activables con código, y los "checks" de quién está al tanto (solo viables en el plano web, parcialmente).

---

## Hipótesis para quien retome

El esquema **oportunista** (degradar con gracia y aprovechar cada ventana de datos) es lo que más vale la pena seguir explorando. Caminos posibles:

1. **App nativa Android.** Rompe *parcialmente* el muro: una app Android nativa **sí** puede leer y enviar SMS automáticamente. Pero: solo Android (iPhone sigue fuera), exige instalación previa al desastre, y Google Play **bloquea** apps con permisos de SMS salvo que sean la app de mensajería por defecto. Menos imposible, no resuelto.

2. **Agente IA en el punto de coordinación.** No para transportar SMS (eso sigue necesitando un gateway físico), sino para **interpretar lenguaje natural caótico** ("estamos atrapados como 5 en chacao edif la quinta") y convertirlo en datos estructurados, deduplicar reportes y priorizarlos para un **coordinador humano que confirma**. Elimina la nomenclatura críptica. Es fase 2+, asiste al coordinador, no sustituye el transporte. Riesgo a vigilar: alucinación en contexto de vida o muerte → la IA propone, el humano dispone.

3. **Gateway institucional (Android+SIM o Twilio) operado por un coordinador**, no por el usuario final. El usuario común usa la web; el SMS es la espina dorsal entre coordinadores entrenados que sí toleran la fricción. Acota el SMS a un rol técnico, que es donde su complejidad se justifica.

4. **Otros transportes que no exploramos a fondo:** Bluetooth/Wi-Fi Direct mesh entre dispositivos cercanos (tipo Bridgefy/Briar), LoRa para brigadas, o redes comunitarias. Cada uno con sus propios muros, pero el problema "comunicar sin infraestructura" tiene más caminos que el SMS.

**Lo más reutilizable del repo:** el modelo de grupos cerrados con RLS, el patrón de sesiones anónimas sin fricción, el offline-first con sync oportunista, el `schema.sql` reproducible, y el catálogo de mensajes por contexto. Nada de eso depende del SMS y todo sirve para cualquier app de coordinación en condiciones degradadas.

---

## Aprendizajes

**Técnicos:**
- Las capacidades de SMS/telefonía son una **frontera de sistema operativo**, no un problema de ingeniería que se resuelve con más código. Verifícalas *antes* de diseñar sobre ellas.
- `drop schema public cascade` en Supabase borra los GRANT por defecto; hay que re-otorgarlos explícitamente en el `schema.sql`, o todo da 42501.
- Las políticas RLS que se auto-referencian causan recursión infinita (42P17); se rompe con funciones `SECURITY DEFINER` acotadas.
- Un upsert necesita `WITH CHECK` en la política de UPDATE, no solo `USING`.
- Las sesiones anónimas de Supabase son una forma elegante de tener `auth.uid()` (y por tanto RLS) sin fricción de registro.
- El service worker solo debe registrarse en producción (rompe el HMR de `next dev`); recuerda versionar el caché para forzar actualizaciones.

**De producto:**
- La pregunta correcta no era "¿cómo construyo una malla SMS?" sino "¿cuál es el trabajo esencial?". El trabajo era *que la gente que se conoce pueda avisarse y verlo, con conexión intermitente.* Para eso, offline-first basta y el SMS sobra casi siempre.
- La elegancia en papel no es robustez en campo. Un sistema que exige inputs manuales en una emergencia está roto por diseño, por bonito que sea el protocolo.
- Es mejor matar la hipótesis equivocada pronto y por escrito, que construirla entera para descubrirlo al final.

---

## Estado final

- **Repo:** https://github.com/Dvargas005/red-centros-acopio
- **Demo:** https://red-centros-acopio-477t.vercel.app
- **Replicar:** fork → crear proyecto Supabase → correr `supabase/schema.sql` → variables de entorno en Vercel → deploy. Pasos en el `README.md`.
- **Arquitectura:** `docs/ARQUITECTURA.md`.

El proyecto no resultó ser lo que esperaba al empezar. Pero la mitad útil —offline-first, grupos, el esquema oportunista— quedó construida y documentada, y el muro quedó mapeado para que el siguiente no pierda el tiempo que yo perdí descubriéndolo. Si retomas esto, salta directo a "Hipótesis para quien retome" y construye desde ahí.
