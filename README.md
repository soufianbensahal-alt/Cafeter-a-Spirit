# Spirit Coffee Loyalty

PWA de fidelización de Cafetería Spirit con experiencia de cliente y modo operativo de cafetería. El frontend sigue siendo HTML, CSS y JavaScript; un build mínimo prepara la distribución estática y el cliente futuro de Supabase.

## Ejecutar

```bash
npm install
npm run build
npm run preview
```

Abre `http://localhost:4173`. Para desarrollo visual sin Supabase también puede servirse el directorio raíz; los mocks continúan siendo la implementación activa.

En Vercel, el modo de empleados está disponible en `/cafeteria` mediante la reescritura definida en `vercel.json`. Para probar esa ruta localmente se necesita un servidor con fallback de SPA (por ejemplo, `vercel dev`); `python -m http.server` no aplica reescrituras.

## Flujos incluidos

- Intro audiovisual de Spirit a pantalla completa, reproducida antes de acceder a la app y omisible con un toque.
- Onboarding de tres pasos, registro y acceso con Supabase Auth.
- Inicio con tarjeta de ocho sellos y accesos rápidos.
- Recompensas con estados disponible y deshabilitado.
- Modal de canje con código de seis dígitos.
- Historial con estado poblado y vacío.
- Perfil, ajustes y cierre de sesión.

El sistema visual está definido mediante variables CSS en `styles.css`: paleta, espaciado, radios, sombras y tipografía.

## Modo cafetería

La experiencia del cliente permanece en `/`. La interfaz operativa para empleados vive en `/cafeteria` y se implementa de forma independiente en:

- `business/business-view.js`: interfaz, estados, validación, confirmación y control del escáner.
- `business/business.css`: estilos mobile-first y responsive del modo cafetería.
- `services/auth-service.js`: sesión, acceso, registro, recuperación y cierre con Supabase Auth.
- `services/employee-service.js`: autorización del equipo mediante `business_members` y estado del negocio.
- `services/customer-service.js`: perfil y flujo Auth del cliente.
- `services/mock-loyalty-service.js`: validación, confirmación, sellos e historial todavía simulados.

El historial simulado se guarda en `localStorage` bajo la clave `spirit-business-transactions` y conserva como máximo cinco operaciones. Esta persistencia es exclusivamente de demostración.

### Datos de prueba

| Entrada | Resultado |
|---|---|
| `123456` | Cliente válido |
| `111111` | Código caducado |
| `222222` | Código ya utilizado |
| `333333` | Código de otra cafetería |
| Cualquier otro código de seis cifras | Código incorrecto |
| QR `SPIRIT:STAMP:DEMO123` | Cliente válido |
| Otro contenido QR | QR no válido |

El lector usa `getUserMedia` y la API nativa `BarcodeDetector`; no se ha incorporado ninguna dependencia externa. Si el navegador no ofrece detección QR nativa, la aplicación muestra un mensaje comprensible y mantiene disponible la introducción manual.

## Autenticación y autorización

La identidad se valida con Supabase Auth. La autorización del modo cafetería se obtiene exclusivamente de `business_members` y `businesses`; nunca se toman roles desde `user_metadata`.

- Cliente: registro, confirmación de correo, acceso, recuperación de contraseña y cierre de sesión reales.
- Empleado: correo y contraseña, restauración segura tras recarga, validación de membresía activa, rol permitido y negocio activo.
- Estados protegidos: comprobando, sin autenticar, sin permisos, autorizado, sesión caducada y error de red.
- El panel nunca se muestra antes de completar la autorización.

Continúan simulados:

- `mockValidateCode()` y `mockValidateQr()` por consultas a `stamp_sessions`.
- `mockConfirmStamp()` por una función RPC atómica que cree `stamp_transactions` y actualice `customer_cards`.
- `mockGetRecentTransactions()` por historial del establecimiento y, si procede, suscripción Realtime.

No hay contraseñas ni credenciales `service_role` en el repositorio. La URL y la clave publicable se inyectan durante el build.

## Preparación de Supabase

La base de datos, el cliente y Supabase Auth están conectados. Los mocks se limitan a la fidelización que todavía no escribe datos reales.

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

`supabase/seed.sql` añade Cafetería Spirit y el programa Tarjeta Café Spirit de 10 sellos, con recompensa Café gratuito. No crea usuarios ni credenciales.

### Seguridad y RLS

- RLS está activa en todas las tablas públicas.
- `anon` no recibe acceso a datos privados.
- Cada cliente sólo puede leer su perfil, tarjetas y transacciones.
- Cada empleado sólo puede leer su propia pertenencia, su negocio, sus programas y las transacciones de ese negocio.
- El navegador sólo puede crear o cambiar `display_name` en el perfil propio.
- No existen grants web para alterar `current_stamps`, `available_rewards`, `used_at` ni insertar `stamp_transactions`.
- `stamp_sessions` no se expone directamente a los roles web.
- La futura confirmación de sellos debe implementarse mediante una operación RPC atómica con validación explícita de usuario y negocio.

El service worker sólo almacena el shell y recursos estáticos del mismo origen. No intercepta peticiones a Supabase ni rutas de API del mismo origen.

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

### URLs de Auth

Configura en **Authentication → URL Configuration** la URL pública de producción como **Site URL** y añade como **Redirect URLs** cada origen permitido con la ruta `/reset-password`. La recuperación usa una pantalla propia en esa ruta y el alta vuelve a `/`.

Ejemplos locales:

```text
http://127.0.0.1:4173/reset-password
http://localhost:3000/reset-password
http://localhost:4173/reset-password
```

En producción añade `https://<dominio-publico>/reset-password`. Si la URL solicitada no está en la lista permitida, Supabase utiliza el Site URL como destino alternativo; por eso un Site URL antiguo como `http://localhost:3000` provoca que el enlace del correo abra una página inexistente.

La pantalla valida la sesión temporal emitida por `PASSWORD_RECOVERY`, solicita la nueva contraseña dos veces, exige un mínimo de ocho caracteres y sólo entonces llama a `supabase.auth.updateUser()`. También ofrece un estado específico para enlaces caducados, inválidos o ya utilizados.
