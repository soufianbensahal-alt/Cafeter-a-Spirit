# Especificación de interfaz · Spirit Coffee

## Tokens

| Token | Valor | Uso |
|---|---:|---|
| `--mustard` | `#EECF62` | Fondo global y color primario extraído del logotipo |
| `--mustard-deep` | `#B89A42` | Profundidad, bordes y foco |
| `--mustard-dark` | `#695C2C` | Texto de marca y acentos oscuros |
| `--ink` | `#2E2D29` | Texto y superficies oscuras |
| `--cream` | `#FEF8E6` | Fondo principal |
| `--paper` | `#FFFCF4` | Modales y superficies cálidas |
| `--surface` | `#FFFDF8` | Tarjetas, campos y navegación |
| `--gutter` | `20px` | Margen móvil constante |
| `--radius-sm` | `16px` | Campos y arte |
| `--radius-md` | `24px` | Tarjetas |
| `--radius-pill` | `999px` | Botones y chips |

La escala de espacio usa 4, 8, 12, 16, 20, 24 y 32 px. Los controles interactivos tienen un mínimo de 44 px.

## Componentes

- `QuickAccess`: cuadrícula de siete tarjetas de 132 px de alto, generadas desde configuración; 2 columnas en móvil, 3 en tablet y 4 en escritorio.
- `LoyaltyCard`: ocho sellos, contador, recompensa objetivo y mensaje dinámico.
- `RewardCard`: arte 82×92 px, nombre máximo visual de una línea, coste y botón siempre visible.
- `HistoryRow`: icono, descripción, fecha y variación de sellos.
- `BottomNav`: componente flotante glassmorphism con cuatro destinos persistentes, desenfoque de fondo y separación mediante `safe-area-inset-bottom`.
- `Modal`: confirmación de canje y código numérico de seis dígitos.

## Estados incluidos

- Recompensa disponible y deshabilitada por saldo insuficiente.
- Historial con contenido y vacío (botón “Ver vacío”).
- Confirmación de canje y actualización del saldo.
- Validación nativa de formulario y consentimiento RGPD obligatorio.
- Confirmaciones ligeras mediante mensajes temporales.

## Breakpoints

- Móvil: ancho fluido hasta 520 px, margen lateral de 20 px.
- Escritorio/tablet: la app conserva formato móvil, centrada sobre un marco oliva.
- Movimiento reducido: animaciones y transiciones se neutralizan con `prefers-reduced-motion`.

## Datos y producción

El prototipo usa estado local en memoria y `localStorage` para recordar el onboarding. Para producción, sustituir por autenticación y API, configurar URLs reales de carta/redes/pedidos y validar los códigos de canje en servidor con expiración y uso único.
