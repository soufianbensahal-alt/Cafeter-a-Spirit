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
- Onboarding de tres pasos y alta con consentimiento RGPD.
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
- `services/mock-loyalty-service.js`: autenticación, validación, confirmación e historial simulados mediante funciones asíncronas.

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

## Próxima fase: integración con Supabase

El modo actual no constituye autenticación ni seguridad reales. Para producción se sustituirá `services/mock-loyalty-service.js` conservando su contrato asíncrono:

- `mockLoginEmployee()` y `mockLogoutEmployee()` por Supabase Auth.
- Validación de pertenencia mediante `business_members` y políticas RLS.
- `mockValidateCode()` y `mockValidateQr()` por consultas a `stamp_sessions`.
- `mockConfirmStamp()` por una función RPC atómica que cree `stamp_transactions` y actualice `customer_cards`.
- `mockGetRecentTransactions()` por historial del establecimiento y, si procede, suscripción Realtime.

No hay claves, URLs, contraseñas reales ni credenciales `service_role` en este prototipo.

## Preparación de Supabase

La base de datos y el cliente están preparados, pero la experiencia sigue usando `mock-loyalty-service.js`. No se realizan consultas reales todavía.

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
