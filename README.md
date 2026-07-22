# Spirit Coffee Loyalty

PWA de fidelización de Cafetería Spirit con experiencia de cliente y modo operativo de cafetería. El frontend sigue siendo HTML, CSS y JavaScript; el build prepara la distribución estática y el cliente de Supabase.

## Ejecutar

```bash
npm install
npm run build
npm run preview
```

Abre `http://localhost:4173`. Los flujos autenticados y operativos requieren las variables públicas de Supabase.

En Vercel, el modo de empleados está disponible en `/cafeteria` mediante la reescritura definida en `vercel.json`. Para probar esa ruta localmente se necesita un servidor con fallback de SPA (por ejemplo, `vercel dev`); `python -m http.server` no aplica reescrituras.

## Flujos incluidos

- Intro audiovisual de Spirit a pantalla completa, reproducida antes de acceder a la app y omisible con un toque.
- Onboarding de tres pasos, registro y acceso por email o Google con Supabase Auth.
- Inicio con progreso, objetivo y recompensas procedentes de la tarjeta real.
- Recompensas disponibles según el programa activo; el canje todavía se realiza en cafetería.
- Historial real de operaciones autorizado por RLS.
- Perfil, ajustes y cierre de sesión.

El sistema visual está definido mediante variables CSS en `styles.css`: paleta, espaciado, radios, sombras y tipografía.

## Modo cafetería

La experiencia del cliente permanece en `/`. La interfaz operativa para empleados vive en `/cafeteria` y se implementa de forma independiente en:

- `business/business-view.js`: interfaz, estados, validación, confirmación y control del escáner.
- `business/business.css`: estilos mobile-first y responsive del modo cafetería.
- `services/auth-service.js`: sesión, acceso, registro, recuperación y cierre con Supabase Auth.
- `services/employee-service.js`: autorización del equipo mediante `business_members` y estado del negocio.
- `services/customer-service.js`: perfil y flujo Auth del cliente.
- `services/user-context-service.js`: consulta centralizada de los contextos cliente y negocio de la identidad autenticada.
- `services/stamp-session-service.js`: creación, validación y confirmación RPC de solicitudes de sello, además del historial mínimo del negocio.
- `services/loyalty-monitor.js`: reglas puras para reconciliar Realtime y su fallback sin duplicar estado.

El historial operativo procede de `stamp_transactions`, está paginado y puede filtrarse por fecha, cliente, empleado y tipo. Muestra cliente parcialmente enmascarado, programa, empleado, resultado y progreso; nunca correos, UUID, tokens o códigos. No se almacena actividad de sellado en `localStorage`.

El lector usa `getUserMedia` y la API nativa `BarcodeDetector`. El QR temporal se genera localmente con la dependencia `qrcode`; si el navegador no ofrece detección QR nativa, la aplicación mantiene disponible la introducción manual.

## Autenticación y autorización

La identidad se valida con Supabase Auth. La autorización del modo cafetería se obtiene exclusivamente de `business_members` y `businesses`; nunca se toman roles desde `user_metadata`.

- Cliente: registro, confirmación de correo, acceso, recuperación de contraseña y cierre de sesión reales.
- Empleado: correo y contraseña, restauración segura tras recarga, validación de membresía activa, rol permitido y negocio activo.
- Estados protegidos: comprobando, sin autenticar, sin permisos, autorizado, sesión caducada y error de red.
- El panel nunca se muestra antes de completar la autorización.
- `getUserContexts()` deriva ambos contextos desde tablas protegidas por RLS. Un empleado no se convierte en cliente por visitar `/`, y una cuenta sólo obtiene tarjeta mediante una adhesión cliente explícita.
- Una identidad que tenga tarjeta y membresía activa puede cambiar entre `/` y `/cafeteria` sin otra contraseña. La autorización se vuelve a consultar tras cada restauración de sesión.

La validación, confirmación, generación de recompensas e historial operativo se ejecutan mediante RPC autenticadas. El frontend no puede escribir directamente en `stamp_sessions`, `customer_cards` ni `stamp_transactions`. La base de datos es siempre la fuente de verdad; el navegador vuelve a consultar la tarjeta después de recibir el evento.

No hay contraseñas ni credenciales `service_role` en el repositorio. La URL y la clave publicable se inyectan durante el build.

## Preparación de Supabase

La base de datos, el cliente y Supabase Auth están conectados. La fidelización operativa escribe mediante una única función transaccional protegida.

### Dependencias fijadas

- `@supabase/supabase-js` `2.110.6`.
- Supabase CLI `2.109.1` como dependencia de desarrollo.
- `esbuild` `0.28.1` para generar la distribución estática sin incorporar un framework.

El lockfile debe conservarse en Git para que instalaciones y despliegues sean reproducibles.

### Variables de entorno

Copia el ejemplo y completa exclusivamente valores públicos:

```bash
cp .env.example .env.local
```

```dotenv
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

El build lee `.env.local` o las variables del entorno. Si faltan, compila correctamente, deja `supabase` como `null` y `requireSupabase()` devuelve un error de configuración comprensible. Nunca uses `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `sb_secret_...` ni `service_role` en el navegador.

En Vercel, crea `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` en **Project Settings → Environment Variables** para Development, Preview y Production según corresponda. Después realiza un nuevo despliegue. `vercel.json` ejecuta `npm run build` y publica `dist`.

### Supabase CLI y migraciones

Requisitos: Node.js 20 o posterior y un runtime compatible con Docker.

```bash
npx supabase --help
npx supabase start
npx supabase db reset --local
npx supabase db lint --local --schema public --level warning
npx supabase migration list --local
```

La carpeta `supabase/` se versiona. Las migraciones nuevas deben crearse siempre mediante:

```bash
npx supabase migration new nombre_descriptivo
```

La migración inicial crea:

- `profiles`
- `businesses`
- `business_members`
- `loyalty_programs`
- `customer_cards`
- `stamp_sessions`
- `stamp_transactions`

La migración `add_auth_profile_trigger` crea el perfil al insertar un usuario Auth y añade el índice compuesto de la relación empleado-negocio. Su función es `SECURITY DEFINER` porque el alta ocurre antes de disponer de una sesión RLS; está aislada en `private`, fija `search_path = ''` y no concede `EXECUTE` a `PUBLIC`, `anon` ni `authenticated`. `raw_user_meta_data.display_name` se usa únicamente como texto de presentación, nunca para autorización.

`supabase/seed.sql` añade datos exclusivamente para desarrollo local. No crea usuarios ni credenciales y no debe ejecutarse en Preview o Production.

### Seguridad y RLS

- RLS está activa en todas las tablas públicas.
- `anon` no recibe acceso a datos privados.
- Cada cliente sólo puede leer su perfil, tarjetas y transacciones.
- Cada empleado sólo puede leer su propia pertenencia, su negocio, sus programas y las transacciones de ese negocio.
- El navegador sólo puede crear o cambiar `display_name` en el perfil propio.
- No existen grants web para alterar `current_stamps`, `available_rewards`, `used_at` ni insertar `stamp_transactions`.
- `stamp_sessions` no se expone directamente a los roles web.
- `confirm_stamp_session` es el único punto de confirmación: bloquea sesión y tarjeta, valida usuario, negocio y programa, marca `used_at`, inserta una transacción y calcula recompensas atómicamente.

El service worker sólo precachea el shell y recursos estáticos del mismo origen. Las navegaciones usan red con fallback al shell ya precacheado; no se guardan respuestas de navegación, Supabase, datos autenticados, tokens ni respuestas privadas.

### Crear el primer propietario

Este procedimiento se realiza una sola vez desde Supabase Dashboard o una conexión administrativa. No debe implementarse como endpoint público:

1. Crea el usuario en **Authentication → Users** y confirma su correo.
2. Copia su UUID de `auth.users`; no copies ni compartas su contraseña.
3. Crea el negocio y conserva el UUID devuelto.
4. Inserta la membresía con rol `owner` y `active = true`.
5. Comprueba que tanto el negocio como la membresía estén activos.

```sql
begin;

insert into public.businesses (id, name, active)
values ('<BUSINESS_UUID>', 'Cafetería Spirit - Montcada', true);

insert into public.business_members (business_id, user_id, role, active)
values ('<BUSINESS_UUID>', '<AUTH_USER_UUID>', 'owner', true);

commit;
```

Los UUID deben sustituirse manualmente por los valores del Dashboard. No se deben incorporar al frontend permisos administrativos ni claves secretas.

### Adhesión explícita a la tarjeta de fidelización

La migración `initialize_spirit_loyalty_data` crea de forma idempotente el negocio `Cafetería Spirit - Montcada` y su programa activo `Tarjeta Café Spirit`. Los índices normalizados de nombre y la restricción existente `(customer_id, loyalty_program_id)` impiden duplicar el negocio, el programa o una tarjeta.

El backfill histórico se conserva para no borrar tarjetas existentes. A partir de `separate_user_contexts_and_histories`, abrir `/` o restaurar una sesión sólo consulta `ensure_own_customer_card()`; esa función ya no inserta datos. Si una identidad todavía no es cliente, la interfaz muestra **Activar mi tarjeta** y sólo esa acción invoca `create_own_customer_membership()`.

La adhesión es idempotente y no recibe `user_id`: deriva siempre el propietario de `auth.uid()` y usa la restricción única `(customer_id, loyalty_program_id)` con `ON CONFLICT DO NOTHING`. Por tanto, un empleado puede tener además contexto cliente si lo solicita expresamente, pero visitar `/cafeteria` nunca crea una tarjeta.

`authenticated` sólo recibe `EXECUTE` sobre esa RPC y conserva acceso de lectura sobre su propia tarjeta mediante RLS. `anon` no puede ejecutarla y el navegador no obtiene permisos directos de inserción o actualización sobre `customer_cards`.

### Google

El frontend inicia OAuth con `supabase.auth.signInWithOAuth()` y vuelve a `/auth/callback`; la sesión persistida es la misma que usan email, cliente y modo cafetería. Los tokens del proveedor no se guardan en `localStorage`, base de datos propia, URL de aplicación ni logs.

Configuración manual necesaria en **Supabase Dashboard → Authentication → Providers**:

1. Activa Google y añade el Client ID/secret creados en Google Cloud. En Google autoriza el callback alojado `https://iabuhjhyvsqhtiqowarq.supabase.co/auth/v1/callback`.
2. En **Authentication → URL Configuration**, mantén la URL pública como Site URL y añade `https://<dominio>/auth/callback`, además de las variantes locales necesarias.
3. No incorpores secretos de Google al repositorio o al frontend.

Supabase enlaza automáticamente la identidad de Google cuando entrega el mismo correo verificado. No se fusionan cuentas por texto de email ni por `user_metadata`.

### URLs de Auth

Configura en **Authentication → URL Configuration** la URL pública de producción como **Site URL** y añade como **Redirect URLs** cada origen permitido con la ruta `/reset-password`. La recuperación usa una pantalla propia en esa ruta y el alta vuelve a `/`.

Ejemplos locales:

```text
http://127.0.0.1:4173/reset-password
http://localhost:3000/reset-password
http://localhost:4173/reset-password
```

En producción añade `https://<dominio-publico>/reset-password` y `https://<dominio-publico>/auth/callback`. Si la URL solicitada no está en la lista permitida, Supabase utiliza el Site URL como destino alternativo; por eso un Site URL antiguo como `http://localhost:3000` provoca que el enlace del correo abra una página inexistente.

La pantalla valida la sesión temporal emitida por `PASSWORD_RECOVERY`, solicita la nueva contraseña dos veces, exige un mínimo de ocho caracteres y sólo entonces llama a `supabase.auth.updateUser()`. También ofrece un estado específico para enlaces caducados, inválidos o ya utilizados.

### Solicitudes temporales de sello

La fase 3 sustituye la generación y validación simuladas por tres RPC autenticadas:

- `create_stamp_request(customer_card_id)` comprueba la propiedad mediante `auth.uid()`, genera un token criptográfico de 256 bits, guarda únicamente su SHA-256 y devuelve una sola vez el token, el código de seis dígitos y una caducidad de 90 segundos.
- `validate_stamp_qr(business_id, qr)` acepta exclusivamente `SPIRIT:STAMP:V1:<token>` y comprueba empleado, membresía activa, negocio, caducidad y uso.
- `validate_stamp_code(business_id, code)` realiza las mismas comprobaciones, limita a diez validaciones por empleado, negocio y minuto y nunca devuelve datos del cliente para intentos fallidos.

Las funciones son `SECURITY DEFINER` de forma intencionada porque `stamp_sessions` y el registro privado de intentos no tienen permisos web directos. Todas fijan `search_path = ''`, validan `auth.uid()` y sólo conceden `EXECUTE` a `authenticated`. La validación devuelve un nombre enmascarado y el progreso previsto, pero no incrementa sellos ni modifica `used_at`. `confirm_stamp_session` realiza después la escritura transaccional e idempotente. El índice único parcial sobre `stamp_session_id`, `used_at` y los bloqueos de fila evitan duplicados ante doble pulsación o concurrencia.

El token y el QR sólo viven en memoria y en el DOM mientras el panel está abierto. No se guardan en `localStorage`, URL, analytics ni logs y se eliminan al cerrar, caducar, navegar o terminar la sesión.

### Actualización inmediata y fallback

Mientras el cliente muestra un QR o código temporal, la app abre una única suscripción de **Postgres Changes** sobre inserciones de `stamp_transactions`, filtrada por `customer_card_id`. La escucha dura como máximo 90 segundos, tiene una sola fila lógica por cliente y conserva la autorización RLS de la tabla. Sólo `stamp_transactions` se añade a `supabase_realtime`; no existen suscripciones globales.

Al recibir el evento, el cliente consulta de nuevo `customer_cards` y el historial, cierra la solicitud visual, elimina QR y código de memoria y muestra el nuevo progreso o la recompensa. La suscripción se elimina al confirmar, caducar, cerrar el modal, cambiar de sección, cerrar sesión o abandonar la página.

Si el canal responde con error, timeout o cierre —o no se establece en ocho segundos— se activa polling cada cinco segundos. El polling se detiene con las mismas condiciones y nunca continúa fuera de una solicitud activa.

## Pruebas

```bash
npm test
npm run build
npx supabase test db --local
npx supabase db lint --local --schema public --level warning
```

Las pruebas JavaScript cubren detección de confirmación, cálculo de recompensa, fallback y derivación aislada de contextos. Las pruebas pgTAP cubren Auth/RLS, aislamiento entre clientes y negocios, adhesión cliente explícita e idempotente, permisos directos, historial filtrado, publicación Realtime y permisos de las RPC. Las pruebas transaccionales remotas deben ejecutarse siempre con `ROLLBACK`; nunca necesitan `seed.sql` en producción.

No se incluyen usuarios ni contraseñas de prueba en el repositorio. Para una prueba manual, crea usuarios desechables desde **Supabase Auth → Users**, configura sus filas de negocio/tarjeta desde una conexión administrativa y elimina o desactiva esos accesos al terminar.

### Prueba manual con dos dispositivos

1. En el dispositivo cliente, inicia sesión, abre Inicio y pulsa **Solicitar sello**.
2. En el dispositivo de cafetería, abre `/cafeteria`, inicia sesión, escanea el QR o introduce el código y confirma.
3. Comprueba que el cliente se actualiza sin recargar, que sólo existe una transacción, que el código deja de funcionar y que el historial del empleado muestra la operación.
4. Si se alcanza el objetivo, comprueba que los sellos vuelven al módulo correcto y aumenta `available_rewards`.
5. Revisa ambas consolas: no deben aparecer tokens, códigos, credenciales ni datos personales.

## Vercel y entornos

- **Development:** usa `.env.local` y `npm run preview`; no compartas el archivo.
- **Preview:** configura las dos variables públicas en Vercel Preview y usa una URL de redirección Auth específica o un proyecto/branch de datos aislado.
- **Production:** configura las variables de Production, las URLs Auth definitivas y aplica migraciones revisadas antes del despliegue. Nunca ejecutes `seed.sql`.

`vercel.json` publica `dist`, conserva `/`, reescribe `/cafeteria` y `/reset-password` hacia la SPA y permite que cámara y service worker funcionen bajo HTTPS. Tras desplegar, prueba instalación PWA, navegación offline del shell, login, recuperación, cámara en iOS/Android y el flujo de dos dispositivos.

## Limitaciones

- El canje/anulación de recompensas todavía no está implementado como operación transaccional; las recompensas disponibles se muestran para su gestión en cafetería.
- `BarcodeDetector` no está disponible en todos los navegadores; el código manual sigue siendo el fallback.
- Postgres Changes es adecuado para el volumen actual. Si se esperan miles de clientes concurrentes, debe migrarse a Broadcast privado con autorización explícita.
