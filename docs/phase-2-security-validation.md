# Fase 2 — validación de seguridad y robustez

## Política de sesiones privilegiadas

La política solo afecta a `/cafeteria`; las sesiones de clientes no cambian.

- Requisito: sesión Supabase autenticada, membresía activa y AAL2 (TOTP).
- Duración máxima absoluta: 8 horas.
- Inactividad máxima: 30 minutos.
- Renovación de actividad en servidor: cada 5 minutos como máximo.
- Varias pestañas comparten la última actividad mediante `localStorage`.
- Al caducar se invalida la sesión privilegiada en servidor y se cierra únicamente la sesión Auth local.
- Una sesión Auth finalizada no puede reabrir el modo cafetería: requiere autenticarse otra vez.

## Límites y alertas por empleado

Los límites usan `pg_advisory_xact_lock`, por lo que dos pestañas o procesos concurrentes comparten el mismo contador.

| Acción | Aviso | Crítico / bloqueo |
| --- | --- | --- |
| Código manual | 8/min | alerta a 10/min; bloqueo del intento 11 |
| QR | 24/min | alerta a 30/min; bloqueo del intento 31 |
| Sellos + canjes confirmados | 24/5 min o 240/24 h | alerta a 30/5 min o 300/24 h; bloqueo del siguiente |

Las señales se guardan en `private.security_alerts` con `event_type = employee_fraud_signal`, empleado, negocio, ventana y contador. No contienen códigos QR, tokens ni datos del cliente.

## Ejecución segura

Nunca ejecutar las pruebas destructivas contra `iabuhjhyvsqhtiqowarq`.

Con Docker/local Supabase:

```sh
npx supabase start
npx supabase db reset
npm run test:sql
SPIRIT_DISPOSABLE_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' npm run test:concurrency
```

En una Supabase Branch desechable, aplicar primero las migraciones a la rama y confirmar expresamente el destino:

```sh
SPIRIT_DISPOSABLE_DB_URL='postgresql://…rama…' \
SPIRIT_CONFIRM_DISPOSABLE_DB=yes \
npm run test:concurrency
```

Los E2E también están bloqueados por defecto. Requieren la URL/clave pública de una instancia desechable, buzón local y fixtures que no contengan datos reales:

```sh
SPIRIT_E2E=1 \
SPIRIT_E2E_SUPABASE_URL='http://127.0.0.1:54321' \
SPIRIT_E2E_SUPABASE_PUBLISHABLE_KEY='…' \
SPIRIT_E2E_MAILBOX_URL='http://127.0.0.1:54324' \
npm run test:e2e
```

Para sello/canje se añaden las credenciales temporales del fixture y su secreto TOTP. Debe comenzar con una tarjeta de 9 sellos y 0 recompensas:

```sh
SPIRIT_E2E_CUSTOMER_EMAIL='…' \
SPIRIT_E2E_CUSTOMER_PASSWORD='…' \
SPIRIT_E2E_EMPLOYEE_EMAIL='…' \
SPIRIT_E2E_EMPLOYEE_PASSWORD='…' \
SPIRIT_E2E_EMPLOYEE_TOTP_SECRET='…' \
npm run test:e2e
```

## Comprobación manual de Google

La ausencia de código OAuth en el repositorio no demuestra que el proveedor alojado esté deshabilitado. Comprobar en el proyecto **Cafetería Spirit - Montcada**:

1. Supabase Dashboard → Authentication → Sign In / Providers.
2. Abrir Google.
3. Confirmar que **Enable Sign in with Google** está desactivado.
4. No modificar otros proveedores ni redirects durante esta comprobación.

Esta verificación es manual porque la configuración de proveedores Auth no se expone mediante SQL ni por el conector disponible.
