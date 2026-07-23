# AI Content Hub

Plataforma SaaS modular de asistente IA, generación de contenido, SEO, redes sociales,
calendario editorial, campañas, monitoreo, automatizaciones e integraciones — un único
producto con un sistema de usuarios, proyectos, historial y diseño compartidos.

El nombre del producto se centraliza en [`src/lib/config.ts`](src/lib/config.ts) (`appConfig.name`,
también configurable vía `NEXT_PUBLIC_APP_NAME`).

## Características

Módulos completamente funcionales, conectados a la base de datos:

- Autenticación (registro/login con credenciales, roles, protección de rutas en servidor).
- Espacios de trabajo y proyectos multi-tenant, con miembros y roles por proyecto.
- Kit de marca (identidad, tono, palabras preferidas/prohibidas) aplicado automáticamente a la IA.
- Generador de contenido con IA (Anthropic) + biblioteca de contenido con versionado, favoritos, papelera lógica.
- Asistente de IA conversacional con historial por proyecto.
- Herramientas SEO con puntuación 100% basada en reglas deterministas y documentadas (sin datos de terceros inventados).
- Redes sociales: publicaciones con estados, calendario editorial (vista de mes + lista), campañas.
- Generador de respuestas (borradores, nunca se envían automáticamente).
- CRM de colaboraciones con marcas (contactos, entregables).
- Monitor de páginas y verificador de enlaces, ambos protegidos contra SSRF (bloqueo de IPs privadas, validación estricta de URL).
- Automatizaciones reales (disparador manual/diario/semanal + acciones: notificar, ejecutar monitor, comprobar enlace), con historial de ejecuciones e idempotencia.
- Integraciones WordPress (REST API + contraseña de aplicación) y GitHub (token personal), con verificación de conexión real y credenciales cifradas en reposo.
- Analíticas basadas únicamente en datos reales guardados o introducidos manualmente (nunca inventadas).
- Panel administrativo (usuarios, roles, suspensión, registro de auditoría).
- Notificaciones internas, exportación de datos de cuenta, eliminación de cuenta.

## Arquitectura

- **Next.js 16** (App Router) + **TypeScript estricto** + **React 19**.
- **Tailwind CSS 4** + **shadcn/ui** (sobre Radix UI y Base UI).
- **PostgreSQL** vía **Neon**, acceso con **Prisma 7** usando el driver adapter `@prisma/adapter-neon` (compatible con entornos serverless/Edge de Vercel).
- **Auth.js (NextAuth) v5** con proveedor de credenciales, sesiones JWT y adaptador de Prisma.
- **Anthropic Claude** como proveedor de IA por defecto, detrás de una interfaz `AIProvider` desacoplada (`src/lib/ai/`) para poder añadir otros proveedores sin tocar el resto del producto.
- Capas separadas: `app/` (rutas y páginas), `components/` (UI), `server/actions` (server actions con validación y autorización), `server/services` (acceso a datos), `lib/` (utilidades transversales: seguridad, IA, validación, permisos).

```
src/
  app/            # rutas (App Router)
  components/     # componentes de UI por módulo + shadcn/ui
  lib/            # config, ai/, security/, validation/, permissions, navigation
  server/
    actions/      # server actions (mutaciones, validan input y permisos)
    services/     # lectura/escritura de datos reutilizable
  generated/prisma/ # cliente de Prisma generado (no se versiona)
prisma/
  schema.prisma
  seed.ts
```

## Requisitos

- Node.js 20+
- Una base de datos PostgreSQL en [Neon](https://neon.tech) (o cualquier Postgres; el adaptador usado es específico de Neon serverless).
- Una clave de API de [Anthropic](https://console.anthropic.com) para las funciones de IA (opcional para probar el resto de la plataforma).

## Instalación

```bash
npm install
cp .env.example .env
# Edita .env con tus valores (ver más abajo)
```

## Variables de entorno

Ver [`.env.example`](.env.example) para la lista completa y comentada. Las imprescindibles para arrancar:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión de Neon (pooled). |
| `AUTH_SECRET` | Secreto de sesión. Genera uno con `npx auth secret`. |
| `ENCRYPTION_KEY` | Clave para cifrar credenciales de integraciones en reposo. |
| `ANTHROPIC_API_KEY` | Clave de Anthropic. Sin ella, los módulos de IA muestran "no configurado" y siguen sin romper el resto de la app. |

Opcionales: `CRON_SECRET` (para proteger las rutas `/api/cron/*`), `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` (reservadas para un futuro flujo OAuth; la integración actual usa un token personal introducido por el usuario), `NEXT_PUBLIC_APP_NAME`.

## Base de datos

```bash
npm run db:migrate     # crea/aplica migraciones en desarrollo (prisma migrate dev)
npm run db:seed        # datos de ejemplo (usuarios, proyecto y contenido de demostración)
npm run db:studio      # Prisma Studio
```

El seed **no debe ejecutarse en producción**: `prisma/seed.ts` lanza un error si `NODE_ENV=production`
salvo que se defina `ALLOW_SEED_IN_PRODUCTION=true` explícitamente. Genera contraseñas aleatorias en cada
ejecución y las imprime por consola — no hay contraseñas reales en el repositorio.

Para producción, usa `npm run db:deploy` (`prisma migrate deploy`), que no genera nuevas migraciones,
solo aplica las existentes.

## Ejecución local

```bash
npm run dev
```

Abre `http://localhost:3000`. La primera cuenta que se registre puede promoverse a `SUPER_ADMIN` directamente
en la base de datos (`UPDATE "User" SET role = 'SUPER_ADMIN' WHERE email = '...'`) para acceder a `/admin`.

## Pruebas, lint, typecheck y build

```bash
npm run lint        # ESLint (0 errores, 0 warnings en el estado actual)
npm run typecheck   # tsc --noEmit (pasa sin errores)
npm run build        # prisma generate + next build (pasa sin errores ni warnings)
npm run test         # Vitest — 15 pruebas sobre el analizador SEO, el guard SSRF y el cifrado
```

Las pruebas cubren lógica pura sin necesidad de base de datos: el analizador SEO (`tests/seo-analyzer.test.ts`),
el bloqueo SSRF de IPs privadas/loopback/esquemas no http (`tests/ssrf-guard.test.ts`) y el cifrado/descifrado
de credenciales, incluida la detección de manipulación (`tests/encryption.test.ts`). No hay pruebas de
integración contra una base de datos real en esta versión — ver limitaciones.

## Despliegue en Vercel + Neon

1. Crea un proyecto en Neon y copia la cadena de conexión pooled a `DATABASE_URL` en las variables de entorno de Vercel.
2. Importa el repositorio en Vercel. El comando de build ya incluye `prisma generate`.
3. Ejecuta las migraciones contra la base de datos de producción antes o durante el primer despliegue:
   ```bash
   DATABASE_URL="..." npx prisma migrate deploy
   ```
4. Configura las variables de entorno de producción (`AUTH_SECRET`, `ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `APP_URL`, `CRON_SECRET`, etc.) en el panel de Vercel.
5. Las tareas programadas están declaradas en [`vercel.json`](vercel.json) (`/api/cron/monitors` cada hora, `/api/cron/automations` cada día). Vercel añade automáticamente la cabecera `Authorization: Bearer $CRON_SECRET`; nuestras rutas la verifican y rechazan cualquier otra petición.

## Configuración de Anthropic (IA)

Define `ANTHROPIC_API_KEY`. El modelo (`AI_MODEL`, por defecto `claude-opus-4-8`), el límite de tokens de
salida (`AI_MAX_TOKENS`) y el timeout (`AI_REQUEST_TIMEOUT`) son configurables por variable de entorno sin
tocar código. Toda llamada a la IA pasa por `src/lib/ai/service.ts`, que aplica: límite de longitud de
entrada, límite de solicitudes por usuario y minuto, caché de resultados por hash de entrada, y registro de
consumo (tokens, latencia, errores) en la tabla `AIUsage`.

## Configuración de WordPress

Desde `Proyecto → WordPress`, introduce la URL del sitio, tu usuario y una
[contraseña de aplicación](https://wordpress.org/documentation/article/application-passwords/) generada en
tu perfil de WordPress. La plataforma verifica la conexión contra `wp-json/wp/v2/users/me` y almacena la
contraseña cifrada (AES-256-GCM) con `ENCRYPTION_KEY`.

## Configuración de GitHub

Desde `Proyecto → GitHub`, introduce un token de acceso personal (con permisos mínimos de solo lectura). Se
verifica contra `api.github.com/user` y se almacena cifrado.

## Seguridad

- Autorización verificada en el servidor en cada server action (nunca solo ocultando botones en el cliente).
- Protección SSRF (`src/lib/security/ssrf-guard.ts`) en el monitor de páginas y el verificador de enlaces: bloquea IPs privadas/loopback/link-local, esquemas distintos de http/https y credenciales embebidas en la URL.
- Credenciales de integraciones cifradas en reposo (AES-256-GCM); nunca se registran en logs ni se devuelven al cliente.
- Contraseñas de usuario con `bcrypt` (12 rondas).
- Validación de entrada con Zod en cada server action.
- Límite de tasa en memoria para las llamadas a IA (`src/lib/security/rate-limit.ts`).
- Rutas `/dashboard/*` y `/admin/*` protegidas en `proxy.ts` (antes `middleware.ts`; renombrado siguiendo la convención de Next.js 16) además de comprobarse de nuevo en cada acción de servidor.

## Limitaciones conocidas

Siguiendo el principio de no simular funcionalidad que no existe, esto es lo que **no** está implementado
en esta versión:

- **Publicación real en redes sociales.** Los posts se guardan y programan internamente, pero no existe
  adaptador OAuth para Instagram/Facebook/TikTok/etc. La plataforma nunca afirma haber publicado cuando no
  lo ha hecho.
- **Calendario con arrastrar y soltar.** La vista de mes es real y funcional, pero mover una fecha se hace
  editando el campo del formulario, no arrastrando la tarjeta.
- **Envío de correo** (recuperación de contraseña, invitaciones por email): no hay proveedor de email
  configurado; añadir miembros a un proyecto requiere que la otra persona ya tenga cuenta.
- **Almacenamiento de archivos** (subida de imágenes/vídeos, logos): el modelo `FileAsset` existe en el
  esquema pero no hay proveedor de almacenamiento de objetos conectado.
- **Stripe / facturación**: el modelo de planes y límites existe y se aplica (p. ej. límite de proyectos por
  plan), pero no hay cobro real integrado.
- **WordPress/GitHub**: se implementó la verificación de conexión real; crear/editar borradores de WordPress
  y listar repositorios/crear issues de GitHub quedan como próximas mejoras.
- **Pruebas automatizadas**: cubren la lógica pura (SEO, SSRF, cifrado). No hay pruebas de integración de
  server actions ni de permisos contra una base de datos real — habría que añadir un contenedor Postgres
  de pruebas para eso.

## Próximas mejoras sugeridas

1. Adaptadores OAuth reales por red social (`SocialProvider` en el diseño ya deja el punto de extensión).
2. Proveedor de almacenamiento de objetos (S3/R2) para `FileAsset`.
3. Proveedor de email transaccional para invitaciones y recuperación de contraseña.
4. Integración de Stripe sobre el modelo `Plan`/`Subscription` ya existente.
5. Drag-and-drop en el calendario editorial.
6. Pruebas de integración (server actions, permisos, RBAC) contra una base de datos Postgres de pruebas.
