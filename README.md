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
- Onboarding de tres pasos, registro y acceso por email con Supabase Auth.
- Inicio con progreso, objetivo y recompensas procedentes de la tarjeta real.
- Recompensas disponibles según el programa activo; el canje todavía se realiza en cafetería.
- Historial real de operaciones autorizado por RLS.
- Perfil, ajustes y cierre de sesión.

La base visual compartida está en `base.css`. `styles.css` contiene únicamente la experiencia cliente y `business/business.css` la experiencia del equipo; `startup.js` carga una sola hoja específica según la ruta.

## Arquitectura del frontend y build

- `bootstrap.js` es el único punto de entrada del navegador y carga dinámicamente cliente o cafetería.
- `app.js` conserva la coordinación de pantallas del cliente; contenido reutilizable se separa en `client/` y las reglas de dominio permanecen en `services/`.
- `client/icons.js` centraliza la iconografía y `client/quick-access.js` la configuración/renderizado de accesos rápidos.
- `data/menu.js`, `data/menu.ca.js` y `data/menu-catalog.js` construyen un catálogo bilingüe validado con identificadores de producto estables, precios y orden compartidos.
- `scripts/build.mjs` genera chunks independientes para cliente y cafetería. Los nombres de JS y CSS incluyen hash de contenido, mientras `index.html`, `startup.js`, manifiestos y `sw.js` permanecen revalidables.
- El service worker instala sólo el shell común mínimo. Después, `bootstrap.js` solicita el calentamiento de la caché de cliente o de cafetería; las respuestas Auth/Supabase nunca forman parte de esas cachés.

Las rutas y los archivos fuente sin hash se mantienen para desarrollo local. El versionado se aplica exclusivamente en `dist/`.

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

El lector usa `getUserMedia` y decodificación local con `jsQR`. El QR temporal se genera localmente con la dependencia `qrcode`; si la cámara o la decodificación no están disponibles, la aplicación mantiene la introducción manual.

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
- `sharp` como herramienta de mantenimiento para optimizar imágenes sin cambiar las URLs públicas.
- ESLint y TypeScript (`checkJs`) para comprobaciones estáticas sin migrar la aplicación a otro framework o lenguaje.

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

El service worker precachea únicamente el shell común mínimo y mantiene cachés separadas para cliente y cafetería. Las navegaciones usan red con fallback al shell; no se guardan respuestas de navegación, Supabase, datos autenticados, tokens ni respuestas privadas. Al activar una versión sólo se retiran cachés antiguas cuyo nombre pertenece a Spirit.

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

### URLs de Auth

Configura en **Authentication → URL Configuration** la URL pública de producción como **Site URL** y añade como **Redirect URLs** cada origen permitido con las rutas `/reset-password`, `/auth/confirm` y `/email-confirmed`. La recuperación usa una pantalla propia en `/reset-password`; las altas nuevas envían `emailRedirectTo` a `/auth/confirm`.

Ejemplos locales:

```text
http://127.0.0.1:4173/reset-password
http://127.0.0.1:4173/auth/confirm
http://localhost:3000/reset-password
http://localhost:3000/auth/confirm
http://localhost:4173/reset-password
http://localhost:4173/auth/confirm
```

En producción están permitidas `https://www.spiritcoffee.es/reset-password` y `https://www.spiritcoffee.es/**`. Si la URL solicitada no está en la lista permitida, Supabase utiliza el Site URL como destino alternativo; por eso un Site URL antiguo como `http://localhost:3000` provoca que el enlace del correo abra una página inexistente.

La plantilla **Authentication → Emails → Confirm sign up** debe conservar todo su diseño y sustituir únicamente el destino del botón por:

```html
<a href="https://www.spiritcoffee.es/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email">
  Confirmar correo
</a>
```

La plantilla alojada fija el único origen aceptado para la confirmación y no consume una redirección proporcionada por el navegador. `/auth/confirm` valida `type=email`, limpia inmediatamente el token de la barra de direcciones y ejecuta `verifyOtp` mediante un cliente Supabase aislado con `persistSession: false`, `autoRefreshToken: false` y `detectSessionInUrl: false`. El cliente principal desactiva además la detección de sesiones en URL exclusivamente en `/auth/confirm`, por lo que un callback implícito antiguo se rechaza. La sesión temporal devuelta por Auth se cierra con `signOut({ scope: 'local' })` y se comprueba con `getSession()` antes de mostrar `/email-confirmed`. El botón de esa pantalla abre `/login`, donde el acceso sigue siendo manual con correo y contraseña.

El token se consume de forma atómica en Supabase Auth. Si el mismo enlace se abre en dos pestañas, solo la primera verificación puede completarse; la segunda termina en el estado de enlace utilizado o caducado. Ninguno de los clientes aislados escribe la sesión en el almacenamiento compartido de la aplicación.

La recuperación utiliza un enlace propio con `{{ .TokenHash }}`:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery">
  Restablecer contraseña
</a>
```

La pantalla no consume el OTP al abrirse. Al enviar ambas contraseñas, crea un cliente Supabase aislado (sin sesión persistente), ejecuta `verifyOtp({ token_hash, type: 'recovery' })` y sólo después llama a `updateUser()`. La verificación en Auth es la barrera de un solo uso: si dos pestañas intentan consumir el mismo enlace, únicamente una puede obtener la sesión temporal. Tras el cambio, la sesión temporal se cierra y la aplicación vuelve al formulario de acceso con una confirmación.

La plantilla versionada está en `supabase/templates/recovery.html`. `supabase/config.toml` la aplica al entorno local. En el proyecto alojado debe copiarse a **Authentication → Email Templates → Reset password**, o aplicarse mediante Management API; el archivo local no modifica por sí solo la plantilla alojada.

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

### Canje seguro de recompensas

Las solicitudes de sello y de canje comparten `stamp_sessions`, diferenciadas por `session_type = stamp | reward_redemption`. Esta opción conserva el mismo ciclo de vida, rate limiting, escáner, código manual y fallback Realtime sin duplicar infraestructura. Los QR usan formatos versionados independientes:

```text
SPIRIT:STAMP:V1:<token>
SPIRIT:REWARD:V1:<token>
```

`create_reward_redemption_request(customer_card_id)` deriva el cliente de `auth.uid()`, exige al menos una recompensa, genera una sesión de 90 segundos y no modifica el saldo. `validate_loyalty_qr` y `validate_loyalty_code` detectan el tipo, limitan intentos y sólo exponen nombre enmascarado, premio y saldo al miembro activo del negocio.

El descuento ocurre exclusivamente en `redeem_reward_session(stamp_session_id)`. La RPC bloquea primero la sesión y después la tarjeta, valida membresía, negocio, programa, caducidad, uso y saldo, resta exactamente una recompensa, marca `used_at` e inserta una transacción `redemption/completed` dentro de la misma transacción PostgreSQL. El índice único por sesión y la lectura del resultado ya registrado hacen que doble clic, reintentos y dos empleados sean idempotentes.

El navegador no puede actualizar `available_rewards`, marcar sesiones ni insertar canjes. `anon` no puede ejecutar las RPC de fidelización y el frontend nunca utiliza `service_role`. El tipo `reversal` se conserva en el modelo para una corrección futura limitada a responsables, pero no existe todavía una RPC de reversión.

## Pruebas

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run check
npx supabase test db --local
npx supabase db lint --local --schema public --level warning
```

`npm run check` ejecuta lint, comprobación estática, build y pruebas JavaScript. GitHub Actions reproduce esos cuatro pasos con Node.js 22 en cada push y pull request. Las pruebas SQL siguen separadas porque necesitan una base local desechable.

Para recomprimir de forma explícita los recursos mantenidos por el proyecto:

```bash
npm run assets:optimize
```

El comando conserva formatos y proporciones; sólo reemplaza un archivo si el resultado es más pequeño. No se ejecuta automáticamente durante el build para evitar reescrituras inesperadas en CI.

Las pruebas JavaScript cubren detección de confirmación de sello y canje, cálculo de recompensa, fallback y derivación aislada de contextos. Las pruebas pgTAP cubren Auth/RLS, aislamiento entre clientes y negocios, adhesión cliente explícita e idempotente, permisos directos, historial filtrado, publicación Realtime y permisos de las RPC. `reward_redemption_test.sql` añade 22 comprobaciones para el décimo sello, creación sin descuento, QR/código, confirmación, idempotencia, segundo empleado, caducidad, uso anterior, negocio cruzado, falta de membresía, auditoría y visibilidad del propietario. Las pruebas transaccionales remotas deben ejecutarse siempre con `ROLLBACK`; nunca necesitan `seed.sql` en producción.

No se incluyen usuarios ni contraseñas de prueba en el repositorio. Para una prueba manual, crea usuarios desechables desde **Supabase Auth → Users**, configura sus filas de negocio/tarjeta desde una conexión administrativa y elimina o desactiva esos accesos al terminar.

### Prueba manual con dos dispositivos

1. En el dispositivo cliente, inicia sesión, abre Inicio y pulsa **Solicitar sello**.
2. En el dispositivo de cafetería, abre `/cafeteria`, inicia sesión, escanea el QR o introduce el código y confirma.
3. Comprueba que el cliente se actualiza sin recargar, que sólo existe una transacción, que el código deja de funcionar y que el historial del empleado muestra la operación.
4. Si se alcanza el objetivo, comprueba que los sellos vuelven al módulo correcto y aumenta `available_rewards`.
5. Pulsa **Usar café gratis**, valida el nuevo QR o código en modo cafetería y comprueba que el saldo no cambia antes de **Confirmar canje**.
6. Confirma que el cliente muestra **Premio canjeado**, cierra la cuenta atrás y refleja el saldo restante sin recargar.
7. Reintenta el mismo QR y código: ambos deben devolver estado usado sin crear otra transacción.
8. Revisa ambas consolas: no deben aparecer tokens, códigos, credenciales ni datos personales.

## Vercel y entornos

- **Development:** usa `.env.local` y `npm run preview`; no compartas el archivo.
- **Preview:** configura las dos variables públicas en Vercel Preview y usa una URL de redirección Auth específica o un proyecto/branch de datos aislado.
- **Production:** configura las variables de Production, las URLs Auth definitivas y aplica migraciones revisadas antes del despliegue. Nunca ejecutes `seed.sql`.

`vercel.json` publica `dist`, conserva `/`, reescribe `/cafeteria` y `/reset-password` hacia la SPA y permite que cámara y service worker funcionen bajo HTTPS. Tras desplegar, prueba instalación PWA, navegación offline del shell, login, recuperación, cámara en iOS/Android y el flujo de dos dispositivos.

## Limitaciones

- La reversión de un canje no está implementada. El tipo `reversal` queda reservado, pero necesita una RPC separada, motivo obligatorio y autorización exclusiva de `owner` o `manager`.
- La prueba de segundo empleado verifica la serialización e idempotencia desde dos identidades de equipo; una prueba de carga con conexiones verdaderamente paralelas sigue siendo recomendable antes de operar a gran escala.
- El acceso a cámara depende del navegador, HTTPS y permisos del dispositivo; el código manual sigue siendo el fallback universal.
- Postgres Changes es adecuado para el volumen actual. Si se esperan miles de clientes concurrentes, debe migrarse a Broadcast privado con autorización explícita.
