# Fase 1 de seguridad: activación operativa

Este documento describe la activación de los cambios preparados en el repositorio. La migración y la configuración externa no deben activarse fuera de este orden: exigir AAL2 antes de habilitar TOTP y probar el acceso bloquearía el modo cafetería.

## 1. Contraseñas

La aplicación y la configuración local exigen 12 caracteres, mayúscula, minúscula, número y símbolo. En el proyecto alojado:

1. Abre **Supabase Dashboard → Authentication → Providers → Email**.
2. Configura longitud mínima `12` y la política de mayúsculas, minúsculas, dígitos y símbolos.
3. Activa **Leaked password protection**. Esta protección alojada no se puede habilitar mediante una migración SQL y puede requerir un plan compatible.
4. Mantén activado **Secure password change**.

No se deben guardar listas de contraseñas filtradas en el frontend ni comprobar contraseñas mediante servicios externos desde el navegador.

## 2. CAPTCHA y altas abusivas

Se utiliza Cloudflare Turnstile. Crea un widget para `spiritcoffee.es`, `www.spiritcoffee.es` y los dominios de desarrollo que realmente se utilicen.

- En Vercel configura `TURNSTILE_SITE_KEY` con la clave pública.
- En Supabase configura Turnstile en **Authentication → Bot and Abuse Protection → CAPTCHA** con la clave secreta.
- Para desarrollo local, exporta `SUPABASE_AUTH_CAPTCHA_SECRET`; nunca la añadas a `.env.local` si ese archivo pudiera versionarse.

La protección se aplica a registro, login, recuperación y reautenticación de contraseña del cliente, y al login del equipo. Supabase sigue garantizando la unicidad por correo normalizado. CAPTCHA, confirmación de correo y límites de alta reducen multicuentas automatizadas, pero no prueban que una persona física tenga una sola cuenta. Para esa garantía haría falta una señal adicional verificada, como teléfono, y una política legal/operativa específica.

## 3. MFA del equipo

1. Activa TOTP en **Supabase Dashboard → Authentication → Multi-Factor Authentication**.
2. Despliega primero la interfaz que permite enrolar y verificar TOTP.
3. Accede con cada owner, manager y employee, completa el enrolamiento y comprueba que la sesión llega a `aal2`.
4. Solo después aplica `20260805183309_phase_1_security_hardening.sql`. La migración exige AAL2 en todas las operaciones protegidas del modo cafetería.

Conserva los códigos/secretos TOTP únicamente en la aplicación autenticadora del empleado. No deben enviarse por correo ni almacenarse en tablas propias.

## 4. Migración y alertas

La migración añade rate limiting transaccional, registro de consentimiento y la tabla privada `private.security_alerts`. Registra:

- fallos sanitizados de validación y canje comunicados por un miembro AAL2;
- agotamiento definitivo de los reintentos del outbox de recompensas.

La tabla es privada y solo `service_role` puede leerla. No se expone `service_role` al frontend. Para convertir estos registros en avisos externos debe configurarse un consumidor de servidor con un destino aprobado (correo, Slack, Sentry u otro). No se ha inventado ningún destinatario ni secreto.

Los fallos de Auth previos a iniciar sesión se registran en los logs nativos de Supabase Auth; el frontend emite además el evento sanitizado `spirit:security-error`. Configura alertas o un log drain desde el Dashboard para detectar aumentos de `invalid_credentials`, bloqueos y errores 5xx. No se debe permitir que usuarios anónimos inserten supuestas alertas directamente en la base de datos.

## 5. Privacidad y consentimiento

El alta registra versión y fecha del consentimiento técnico en `privacy_consents`. Antes de producción se necesita validación legal del texto de privacidad, responsable del tratamiento, finalidades, base jurídica, conservación, destinatarios, derechos y canal de contacto. La versión usada por la interfaz es `2026-08-05`; debe coincidir con un documento real y accesible antes de activar el registro.

El registro técnico no sustituye una política de privacidad válida ni convierte en opcional el tratamiento imprescindible para prestar el servicio.

## 6. Orden seguro resumido

1. Validar y publicar la política de privacidad.
2. Configurar la política de contraseñas y protección de contraseñas filtradas en Supabase.
3. Crear Turnstile y configurar claves en Vercel/Supabase.
4. Activar TOTP en Supabase.
5. Desplegar frontend, CSP y cabeceras.
6. Enrolar y probar al menos dos cuentas autorizadas del equipo en AAL2.
7. Aplicar la migración SQL.
8. Verificar login, recuperación, alta, sello, canje y outbox.
9. Configurar el consumidor de `security_alerts` y las alertas de Auth.

## 7. Reversión operativa

Si el modo cafetería queda bloqueado, no desactives RLS ni concedas permisos directos. Comprueba primero que TOTP está habilitado, que la cuenta tiene un factor verificado y que el JWT actual contiene `aal2`. La retirada de la exigencia debe realizarse mediante una nueva migración revisada, nunca editando el historial ya aplicado.
