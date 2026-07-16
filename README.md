# Spirit Coffee Loyalty

Prototipo móvil navegable de la app de fidelización de Cafetería Spirit. No requiere compilación ni dependencias.

## Ejecutar

```bash
python3 -m http.server 4173
```

Abre `http://localhost:4173`.

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
