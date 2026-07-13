# Spirit Coffee Loyalty

Prototipo móvil navegable de la app de fidelización de Cafetería Spirit. No requiere compilación ni dependencias.

## Ejecutar

```bash
python3 -m http.server 4173
```

Abre `http://localhost:4173`.

## Flujos incluidos

- Intro audiovisual de Spirit a pantalla completa, reproducida antes de acceder a la app y omisible con un toque.
- Onboarding de tres pasos y alta con consentimiento RGPD.
- Inicio con tarjeta de ocho sellos y accesos rápidos.
- Recompensas con estados disponible y deshabilitado.
- Modal de canje con código de seis dígitos.
- Historial con estado poblado y vacío.
- Perfil, ajustes y cierre de sesión.

El sistema visual está definido mediante variables CSS en `styles.css`: paleta, espaciado, radios, sombras y tipografía.
