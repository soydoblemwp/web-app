# Backlog pendiente de producción — 2026-08-04

Producción está en el commit `1df2dbd` (rama `main`). Todo lo listado aquí existe
únicamente en la rama local `checkpoint/pre-production-backlog-2026-08-04`
(commit `f92345b`) — nada de esto se ha desplegado.

Las migraciones de Prisma se aplican en orden estricto y cronológico
(`prisma migrate deploy` aplica cualquier carpeta de `prisma/migrations/` que
falte, en el orden de su timestamp). Una migración puede referenciar
(`FOREIGN KEY`) cualquier tabla creada por una migración anterior, sin
importar de qué "funcionalidad" sea — por eso la columna **Dependencia real**
está basada en `FOREIGN KEY`/`REFERENCES` reales de cada `migration.sql` y en
imports `@/...` reales del código, no en la agrupación conceptual por fase.

## Tabla principal

| # | Funcionalidad | Archivos principales | Migración | Dependencia real de otras áreas | Variables de entorno requeridas | Estado actual | Riesgo de despliegue | Orden recomendado | Comprobación mínima |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Verificación por correo** | `src/server/actions/email-verification.ts`, `src/server/services/email-verification.ts`, `src/lib/auth/verification-token.ts`, `src/app/(auth)/verify-email/`, `src/components/auth/verify-email-pending.tsx`, `src/lib/permissions/index.ts` (gating de `requireUser()`) | `20260725190000_add_email_verification`, `20260725190100_add_email_verification_token_used_at` | Ninguna | `RESEND_API_KEY`, `EMAIL_FROM` (si faltan, `sendEmail()` lanza error controlado — el registro no se rompe, pero **usuarios nuevos** nunca reciben el enlace y quedan bloqueados hasta que se configuren) | Código completo, sin desplegar. Migración incluye backfill (`UPDATE User SET emailVerified = createdAt WHERE emailVerified IS NULL`) que protege cuentas existentes, incl. SUPER_ADMIN | **Alto si se despliega sin `RESEND_API_KEY` configurada** — bloquea registro de cuentas nuevas de forma permanente | Independiente — puede ir en cualquier momento, pero solo con `RESEND_API_KEY`/`EMAIL_FROM` ya configuradas en Vercel | `tests/email-verification.test.ts`; probar registro + verificación real con Resend configurado antes de exponerlo |
| 2 | **Editor Command Center** | `src/components/editor/`, `src/lib/editor/seo-score.ts`, cambios en `ContentItem` (`channel`, `objective`, `seoKeyword`, etc.) | `20260725200000_add_editor_command_center` | Ninguna | Ninguna nueva | Código completo, sin desplegar | Bajo — solo columnas nuevas nullable + 2 valores de enum (`IDEA`, `SCHEDULED`) sobre `ContentItem` existente | Independiente | `tests/editor.test.ts`, `tests/editor-command-center.test.ts` |
| 3 | **Campaign Studio** | `src/server/services/campaign-studio.ts`, `src/server/actions/campaign-studio.ts`, `src/app/(dashboard)/dashboard/[projectId]/campaign-studio/` | `20260725210000_add_campaign_studio` | Ninguna en código; **es dependencia de otros** (ver fila Agentes) | Ninguna nueva | Código completo, sin desplegar | Medio — crea `CampaignStrategy`/`CampaignPillar`/`CampaignContentPiece`, referenciadas después por `AiAgentResource` | **Debe ir antes que Agentes** (ver más abajo) | `tests/campaign-studio.test.ts` |
| 4 | **Publishing Hub** | `src/server/services/publishing.ts`, `src/server/actions/publishing*.ts`, `src/app/(dashboard)/dashboard/[projectId]/publishing/` | `20260725220000_add_publishing_hub` | Ninguna | Ninguna nueva | Código completo, sin desplegar | Bajo — tablas nuevas (`PublicationMedia`, `PublicationApprovalEvent`, `PublicationAttempt`, `PublicationSeries`, `PublicationTemplate`, `PublishingChecklistTemplate`), ninguna referenciada desde fuera | Independiente | `tests/publishing.test.ts` |
| 5 | **Marketing Brain** (+ optimización + strategy brief) | `src/server/services/marketing-brain*.ts`, `src/lib/marketing-brain/*`, `src/app/(dashboard)/dashboard/[projectId]/marketing-brain/` | `20260726120000_add_marketing_brain`, `20260731090000_add_marketing_brain_optimization_loop`, `20260731090100_add_marketing_brain_strategy_brief` | Ninguna hacia atrás; **Customer Support depende de esta** (`agent-orchestrator.ts` importa `marketing-brain-performance-context.ts`/`marketing-brain-optimization.ts` para el despachador genérico de agentes) | Ninguna nueva | Código completo, sin desplegar | Medio | **Requerido antes de Customer Support** | `tests/marketing-brain.test.ts`, `tests/marketing-brain-optimization.test.ts` |
| 6 | **Agentes IA** (estudio + gobernanza + policy studio) | `src/server/services/agent-*.ts` (20 archivos), `src/server/actions/agent*.ts`, `src/app/(dashboard)/dashboard/[projectId]/agents/`, `.../agent-teams/` | `20260727090000_add_ai_agent_studio`, `20260801090000_add_ai_agent_governance`, `20260802090000_add_ai_agent_policy_studio` | `AiAgentResource` tiene `FOREIGN KEY` a `CampaignStrategy`/`CampaignPillar`/`CampaignContentPiece` (Campaign Studio) y a `SocialPost`/`FileAsset`/`ContentItem`/`Campaign` (ya existentes). **Customer Support depende de esta** (`agent-customer-support.ts`, `agent-orchestrator.ts` están en su cadena de imports directa) | Ninguna nueva | Código completo, sin desplegar | Alto — es la pieza más grande (49 archivos) y la que más tira de otras áreas | **Requerido antes de Customer Support**, y después de Campaign Studio | `tests/agents.test.ts`, `tests/agent-governance.test.ts`, `tests/agent-governance-policy-studio.test.ts`, `tests/agent-performance-strategist.test.ts` |
| 7 | **Knowledge Base** | `src/server/services/knowledge-*.ts`, `src/lib/knowledge/*`, `src/app/(dashboard)/dashboard/[projectId]/knowledge/` | `20260728100000_add_knowledge_base` | Ninguna hacia atrás; **Customer Support depende de esta** (`customer-support-chat.ts` importa `knowledge-search`/`knowledge-context` directamente para la ruta de respuesta) | Ninguna nueva | Código completo, sin desplegar | Medio | **Requerido antes de Customer Support** | `tests/knowledge.test.ts` |
| 8 | **Automatizaciones (Workflow Automation)** | `src/server/services/automation-*.ts`, `src/lib/automations/*`, `src/app/(dashboard)/dashboard/[projectId]/automations/`, `src/app/api/cron/workflow-automations/` | `20260729090000_add_workflow_automation` | Ninguna hacia atrás; **Customer Support depende de esta** (`customer-support-config.ts`, `customer-support-faq.ts`, `customer-support-public-site.ts`, `customer-support-widget.ts`, etc. llaman `publishAutomationEvent()` en cada escritura) | `AUTOMATION_CRON_SECRET` (si falta, el cron queda en 503, no bloquea el resto), `AUTOMATION_WEBHOOK_SIGNING_WINDOW_SECONDS`, `AUTOMATION_MAX_WEBHOOK_BODY_BYTES`, `AUTOMATION_MIN_SCHEDULE_INTERVAL_MINUTES`, `AUTOMATION_PROCESSING_BATCH_SIZE` (todas con default seguro si faltan) | Código completo, sin desplegar | Alto — **Customer Support literalmente no compila/ejecuta sin este módulo** | **Requerido antes de Customer Support** | `tests/automations.test.ts`, `tests/guest-automations.test.ts` |
| 9 | **Performance Center** (+ categoría de analítica) | `src/server/services/performance-*.ts`, `src/lib/performance/*`, `src/app/(dashboard)/dashboard/[projectId]/performance/` | `20260730090000_add_performance_center`, `20260803090100_add_performance_analytics_category` | Ninguna hacia atrás; **Customer Support depende de esta** (`agent-orchestrator.ts` importa `performance-goals.ts` y el árbol `lib/performance/*` para el "performance strategist" del despachador genérico) | `PERFORMANCE_MAX_CSV_BYTES`, `PERFORMANCE_MAX_JSON_BYTES`, `PERFORMANCE_MAX_IMPORT_ROWS` (todas con default seguro) | Código completo, sin desplegar | Medio | **Requerido antes de Customer Support** | `tests/performance.test.ts`. Nota: `src/lib/performance/csv.ts` (usado por `customer-support-faq.ts` para importar/exportar FAQs) es autocontenido y sin dependencias — no arrastra el resto del módulo |
| 10 | **Integraciones Google (GA4 + Search Console)** | `src/server/services/google-*.ts`, `src/app/api/integrations/google/`, `src/app/(dashboard)/dashboard/[projectId]/integrations/google/` | `20260803090000_add_google_integrations_hub` | Ninguna | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` (si faltan, la página de Integraciones > Google muestra "configuración pendiente", no rompe nada) | Código completo, sin desplegar | Bajo | Independiente | `tests/google-integrations.test.ts` |
| 11 | **Customer Support Agent** (servicio + widget + chat) | `src/server/services/customer-support-*.ts` (15 archivos), `src/lib/customer-support/*`, `src/server/actions/customer-support.ts`, `src/app/api/customer-support/`, `src/app/(dashboard)/dashboard/[projectId]/customer-support/`, `src/components/customer-support/` | `20260804090000_add_customer_support_agent` (FK real a `AiAgentRun`), `20260805090000_add_customer_support_public_site_binding` | **Depende en código y en FK de: Agentes IA, Automatizaciones, Knowledge Base, Marketing Brain, Performance Center, Campaign Studio** (ver fila 6) | Ninguna nueva propia | Código completo, sin desplegar | Alto — es el objetivo de este trabajo, pero no es aislable | Después de las filas 3, 5, 6, 7, 8, 9 | `tests/customer-support.test.ts`, `tests/customer-support-hostname-binding.test.ts`, `tests/customer-support-public-widget.test.ts` |
| 12 | **Panel administrativo de Customer Support** | `src/server/actions/admin-customer-support.ts`, `src/app/admin/projects/[projectId]/customer-support/`, `src/components/admin/customer-support/` | Ninguna propia (usa las tablas de la fila 11) | Depende de la fila 11 (Customer Support) y transitivamente de todo lo que esa fila requiere | Ninguna nueva | **Terminado y verificado localmente** (lint/tsc/build limpios) esta sesión | Bajo en sí mismo — el riesgo real es el de la fila 11, de la que depende por completo | Después de la fila 11 | Manual: entrar como ADMIN/SUPER_ADMIN, configurar proyecto, publicar FAQs, activar, reclamar dominio (pendiente de ejecutar) |

## Notas sobre la cadena de dependencias real de Customer Support

Se verificó mediante cierre transitivo de imports (`@/...`) desde todo el
árbol de Customer Support + el panel administrativo nuevo, y mediante lectura
directa de cada `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` en
`20260804090000_add_customer_support_agent/migration.sql` y
`20260805090000_add_customer_support_public_site_binding/migration.sql`:

- `CustomerSupportMessage.aiAgentRunId` → `FOREIGN KEY REFERENCES "AiAgentRun"("id")` — la tabla `AiAgentRun` la crea la migración de Agentes IA. **La migración de Customer Support no puede aplicarse sin ella.**
- `AiAgentResource` (parte de Agentes IA) tiene `FOREIGN KEY` a `CampaignStrategy`/`CampaignPillar`/`CampaignContentPiece` (Campaign Studio). **Agentes IA no puede aplicarse sin Campaign Studio.**
- `customer-support-widget.ts` (la ruta real que procesa cada mensaje del visitante) importa `startPublicSupportRun`/`completePublicSupportRun`/`failPublicSupportRun` de `@/server/services/agent-customer-support` — sin este módulo el widget no compila.
- `customer-support-config.ts`, `customer-support-faq.ts`, `customer-support-public-site.ts`, `customer-support-conversation.ts`, `customer-support-handoff.ts`, `customer-support-knowledge.ts`, `customer-support-widget.ts` importan `publishAutomationEvent` de `@/server/services/automation-events` — sin Automatizaciones, ninguna de esas escrituras compila.
- `customer-support-chat.ts` (el emparejador determinista de FAQs) importa `searchKnowledgeCandidates`/`knowledge-context` de Knowledge Base directamente.
- `agent-orchestrator.ts` (el despachador genérico de agentes, usado por `agent-customer-support.ts`) importa módulos de Marketing Brain y Performance Center porque despacha varios tipos de agente (soporte, marketing brain, performance strategist) desde un mismo archivo — no es evitable sin reescribir ese despachador.

**Verificado como NO requerido** (ni por import de código ni por `FOREIGN KEY` en ninguna migración posterior): Verificación por correo, Editor Command Center, Publishing Hub, Integraciones Google.

## Aviso sobre `schema.prisma`

`prisma/schema.prisma` es un único archivo (+4319/−148 líneas en este
checkpoint) que debe coincidir exactamente con las migraciones realmente
aplicadas. `prisma migrate deploy` no compara `schema.prisma` contra la base
de datos — solo aplica las carpetas de migración presentes, en orden — pero
si `schema.prisma` declara una columna cuya migración NO se aplicó, cualquier
consulta Prisma sin `select` explícito (que por defecto selecciona todas las
columnas escalares declaradas) fallaría en tiempo de ejecución contra esa
columna inexistente. Por eso, si se aplican solo las migraciones marcadas
"Requerido antes de Customer Support" (sin las 5 no-requeridas), no basta con
excluir esas carpetas de migración: `schema.prisma` tendría que recortarse a
mano para quitar los modelos/columnas de las áreas excluidas — una edición
manual de un archivo de ~5000 líneas, propensa a error, que no se ha
intentado en este checkpoint. Ver sección "Primer lote de staging" más abajo
para la recomendación concreta.

## Primer lote de staging (no desplegado — solo definición)

Objetivo: el mínimo real para que Customer Support y su panel administrativo
funcionen en un entorno de staging.

### Migraciones necesarias (13 de 18, en este orden exacto)

1. `20260725210000_add_campaign_studio`
2. `20260726120000_add_marketing_brain`
3. `20260727090000_add_ai_agent_studio`
4. `20260728100000_add_knowledge_base`
5. `20260729090000_add_workflow_automation`
6. `20260730090000_add_performance_center`
7. `20260731090000_add_marketing_brain_optimization_loop`
8. `20260731090100_add_marketing_brain_strategy_brief`
9. `20260801090000_add_ai_agent_governance`
10. `20260802090000_add_ai_agent_policy_studio`
11. `20260803090100_add_performance_analytics_category`
12. `20260804090000_add_customer_support_agent`
13. `20260805090000_add_customer_support_public_site_binding`

Verificado explícitamente: ninguna de estas 13 migraciones, ni en su SQL
(`CREATE TABLE`/`ALTER TABLE`/`FOREIGN KEY`) ni en el código que las usa,
referencia una tabla creada por `add_email_verification` (x2),
`add_editor_command_center`, `add_publishing_hub` o
`add_google_integrations_hub`. Esas 5 son técnicamente omitibles.

**Pero (ver aviso de `schema.prisma` arriba): omitir esas 5 migraciones exige
recortar a mano `schema.prisma` para que coincida exactamente — si no,
cualquier consulta Prisma sin `select` explícito en código YA desplegado
(por ejemplo sobre `User` o `ContentItem`) intentaría leer una columna que no
existe en la base de datos y fallaría en producción.** Esa edición manual no
se ha hecho y no se recomienda improvisarla. Por eso la recomendación
práctica de este documento es la Opción B, no la Opción A:

- **Opción A (técnicamente mínima, mayor riesgo operativo):** aplicar solo
  las 13 migraciones de arriba + recortar `schema.prisma` a mano para quitar
  `EmailVerificationToken`, `User.emailVerified`, las columnas de
  `add_editor_command_center`, los modelos de Publishing Hub y los de Google
  Integrations. Requiere una revisión cuidadosa, dedicada, del archivo de
  schema antes de intentarlo.
- **Opción B (recomendada):** aplicar las **18 migraciones completas** (así
  `schema.prisma` se despliega tal cual está, sin edición manual — cero
  riesgo de columna faltante), pero desplegar como **código de aplicación**
  solo lo necesario para Customer Support + su panel admin (fila 11 y 12) y
  sus dependencias reales (filas 3, 5, 6, 7, 8, 9). El código de UI/acciones
  de Verificación por correo, Editor Command Center, Publishing Hub e
  Integraciones Google puede quedar sin desplegar — sus tablas existirían en
  la base de datos pero vacías y sin ninguna ruta que las use, lo cual es
  inofensivo. Esto es lo que se recomienda para el primer lote de staging.

### Módulos de código necesarios (Opción B)

- Todo `src/server/services/customer-support-*.ts`, `src/lib/customer-support/*`, `src/server/actions/customer-support.ts`
- Todo `src/server/services/agent-*.ts`, `src/server/actions/agent*.ts`, `src/lib/agents/*`
- Todo `src/server/services/automation-*.ts`, `src/lib/automations/*`, `src/app/api/cron/workflow-automations/`
- Todo `src/server/services/knowledge-*.ts`, `src/lib/knowledge/*`
- Todo `src/server/services/marketing-brain*.ts`, `src/lib/marketing-brain/*`
- `src/lib/performance/*` y `src/server/services/performance-goals.ts` (dependencias reales de `agent-orchestrator.ts`) — el resto de Performance Center (páginas de dashboard, importaciones CSV/JSON, experimentos) puede omitirse si se quiere un lote aún más pequeño, pero solo si nada del dashboard de Performance se expone
- `src/server/actions/admin-customer-support.ts`, `src/app/admin/projects/[projectId]/customer-support/`, `src/components/admin/customer-support/` (el panel nuevo de esta sesión)
- Dashboard de Customer Support: `src/app/(dashboard)/dashboard/[projectId]/customer-support/`
- Campaign Studio y Marketing Brain/Knowledge/Automations NO necesitan exponer sus propias páginas de dashboard para que Customer Support funcione — solo sus tablas (migraciones) y sus módulos de servicio que `agent-orchestrator.ts`/`customer-support-*.ts` importan directamente

### Variables de entorno necesarias

- Ninguna nueva es estrictamente obligatoria para que Customer Support funcione (Automatizaciones y Performance tienen defaults seguros si sus variables faltan).
- Recomendado configurar de todas formas antes de activar el agente en staging: `AUTOMATION_CRON_SECRET` (si se quiere que la cola de eventos de Automatizaciones se procese sola vía cron, en vez de manualmente).

### Funcionalidades que pueden quedar fuera de este lote

Verificación por correo, Editor Command Center, Publishing Hub, Integraciones
Google — sus migraciones pueden ir igualmente (Opción B), pero su código de
aplicación (páginas, acciones, UI) no necesita desplegarse en este lote.

### Riesgos concretos

- **82,103 líneas insertadas** en este checkpoint — ningún revisor humano las ha visto pasar por producción todavía; el primer despliegue real de 6 áreas grandes a la vez (Customer Support, Agentes, Automatizaciones, Knowledge Base, Marketing Brain, Performance) es la primera vez que corren contra datos reales.
- 12 de las 13 migraciones nunca se aplicaron contra ninguna base de datos que no sea la de desarrollo local.
- El commit del panel administrativo (`admin-customer-support.ts`) autoriza vía `requireAdmin()`/`requireSuperAdmin()`, ya verificado contra el código ya desplegado en `main` — no depende de la Opción A/B para funcionar correctamente en cuanto al control de acceso.
- Sin `RESEND_API_KEY`/`EMAIL_FROM`, si en algún momento posterior se despliega también Verificación por correo, cualquier usuario nuevo quedaría bloqueado — no aplica a este lote si Verificación por correo se deja fuera.

### Procedimiento de reversión

- **Código:** revertir el despliegue en Vercel al deployment anterior (`1df2dbd`) desde el dashboard de Vercel o `vercel rollback` — inmediato, sin tocar la base de datos.
- **Base de datos (Opción B, 18 migraciones aplicadas):** Prisma Migrate no tiene "down migrations" automáticas en este proyecto (no existen archivos `.down.sql`). Revertir el esquema requeriría escribir manualmente el SQL inverso de cada migración aplicada (`DROP TABLE`/`ALTER TABLE ... DROP COLUMN`) en orden inverso, o restaurar desde un snapshot/backup de la base de datos tomado inmediatamente antes de aplicar las migraciones. **Por eso: tomar un snapshot/backup explícito de la base de datos de producción inmediatamente antes de ejecutar `prisma migrate deploy`, sin excepción.**
- Ninguna migración de este lote es destructiva sobre datos existentes (todas son `CREATE TABLE` o `ALTER TABLE ADD COLUMN` nullable/con default) — revertir el CÓDIGO sin revertir el ESQUEMA es seguro: las tablas nuevas quedarían sin uso, sin afectar las rutas ya existentes.
