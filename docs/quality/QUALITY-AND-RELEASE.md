# Calidad y validación antes de Producción

## Propósito y estado

Esta guía define la preparación, el orden y los criterios de la fase **09 · Validación previa a Producción**. Su existencia no demuestra que una herramienta esté instalada, que Staging tenga una configuración vigente ni que una comprobación haya pasado. El estado y la evidencia resumida de la fase se mantienen en el [roadmap](../ROADMAP.md); esta guía no es una bitácora de incidentes.

La fase requiere que la [fase 08](../ROADMAP.md#08-staging--completada) esté aceptada y que Staging esté operativo. Antes de cada validación remota, comprueba despliegues, hostnames y SHA de `Frontend`, `Backend` y `worker`. Para la entrega externa de correo, sigue la [guía de Resend](../architecture/services/RESEND.md); la configuración del Worker en Railway está en [RAILWAY.md](../architecture/services/RAILWAY.md). Registra la evidencia resumida en el roadmap; esta guía contiene el procedimiento, no resultados de ejecuciones.

El flujo existente ejecuta pruebas con `node:test`, ESLint, build de Frontend y validación/generación de Prisma mediante GitHub Actions. Esta preparación agrega Playwright y axe con versiones exactas, una suite corta de navegador y su ejecución en CI; CI también ejecuta el caso de indexación con `ROBOTS_INDEXABLE=true` para cubrir el opt-in. Lighthouse y ZAP siguen siendo herramientas puntuales de auditoría, no checks de cada PR. Las pruebas opcionales de base de datos se ejecutan sólo mediante una composición aislada.

## Objetivo y alcance

Aceptar un candidato identificado de Staging mediante:

- lint, pruebas y build del mismo commit;
- recorridos críticos reproducibles en Staging, en escritorio y móvil;
- axe y revisión manual de accesibilidad;
- Lighthouse para rendimiento y SEO, con objetivos acordados antes de usarlos como bloqueo;
- ZAP Baseline en modo pasivo y revisión de seguridad que reproduzca y confirme los hallazgos;
- revisión de dependencias y configuración;
- respaldo y restauración en un destino aislado;
- comprobación de alertas y ensayo de rollback;
- entrega funcional de correos y PDF dentro del recorrido de compra y cuenta.

La superficie indexable definida para el MVP es la landing y su escaparate; consultar [Renderizado y SEO](../architecture/RENDERING-AND-SEO.md). Staging debe conservar su política de no indexación: `ROBOTS_INDEXABLE` debe ser `false` o estar ausente; su valor predeterminado es `false`. Producción sólo habilitará la landing con un `true` explícito después de aprobar la salida. Las rutas de cuenta y cualquier otra ruta permanecen en `noindex`. No se alterará esa política para mejorar una puntuación Lighthouse.

## Dependencias y preparación por responsable

| Responsable | Preparación previa | Resultado necesario |
|---|---|---|
| Responsable del proyecto | Aprobar los objetivos de rendimiento y SEO, presupuesto de ejecución, destinatarios de prueba, cuentas sintéticas, datos que se pueden crear y ventana para la revisión | Criterios, recursos de prueba y límites aprobados antes de bloquear o generar actividad externa |
| Responsable de Railway | Confirmar entorno, servicios, dominios, commit desplegado de Frontend/Backend/worker, estado de `/health`, Checkout `test`, variables requeridas y plan/costos de respaldos y monitores | Identidad del candidato y configuración vigente verificadas en Railway; secretos comprobados sin copiarlos a logs o evidencias |
| Desarrollo/QA | Preparar dependencias fijadas, lockfile, configuración Playwright/axe, recorridos, navegador y almacenamiento de informes | Instalación con `npm ci` y comandos reproducibles desde el repositorio |
| Responsable de correo | Autorizar un buzón de pruebas | Confirmaciones y recibos de prueba recibidos sin exponer datos personales reales |
| Responsable de datos/operación | Preparar una copia de prueba o dataset sintético y un destino aislado de restauración; acordar alertas y rollback sin tocar servicios compartidos | Restauración verificable, notificación de prueba y rollback ensayado con alcance y costo aprobados |

### Candidato y configuración de Staging

Antes de comenzar, selecciona el entorno Staging correcto y copia en la hoja de ejecución sus hostnames y SHA desplegados. Consulta [Railway](../architecture/services/RAILWAY.md) para la configuración de los servicios; no guardes hostnames resueltos en este procedimiento.

Antes de empezar, registra la revisión completa de cada despliegue de aplicación y comprueba que `Frontend`, `Backend` y `worker` corresponden al mismo candidato. Revisa, sin revelar sus valores, que las variables requeridas por el código y por la guía Railway estén presentes y correspondan a Staging: `FRONTEND_ORIGIN`, `INTERNAL_API_URL`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `STRIPE_MODE`, `CHECKOUT_ENABLED`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `MAIL_FROM` y `RESEND_FROM`. Verifica además que `ROBOTS_INDEXABLE` no sea `true` en Staging; si está ausente, la aplicación usa `false`. Checkout debe seguir en `test`; no se usarán claves live ni se cambiará la configuración para hacer pasar una prueba.

Comprobaciones de solo lectura para confirmar que los hostnames elegidos responden:

```text
GET https://<frontend-hostname>/
GET https://<backend-hostname>/health
GET https://<frontend-hostname>/api/backend/public-config
```

La API debe responder con salud correcta y base conectada; la configuración pública debe mostrar el estado de Checkout previsto para ese entorno. Estos endpoints no identifican por sí solos el commit: confírmalo en Railway. Comprueba variables sólo por nombre, sin copiar valores secretos, `STRIPE_MODE=test`, Checkout de prueba y `ROBOTS_INDEXABLE` apagado en Staging. Si no se puede confirmar el commit, no atribuyas resultados ni declares aceptado el candidato.

### Versiones y herramientas

Mantén las versiones exactas en los manifiestos/lockfiles o en la referencia inmutable del contenedor; guarda la versión real usada en cada informe. Como base de preparación revisada para esta guía el **2026-11-18**:

| Herramienta | Versión base | Uso y condición |
|---|---:|---|
| Node.js | `24.21.0` | Versión usada por el workflow y las imágenes del proyecto |
| `@playwright/test` | `1.65.1` | Dependencia exacta de desarrollo de Frontend y lockfile |
| `@axe-core/playwright` | `4.14.0` | Dependencia exacta de desarrollo de Frontend y lockfile |
| Lighthouse CLI | `13.6.0` | Ejecución local con Chrome; no es una dependencia de runtime |
| ZAP Baseline | `zaproxy/zap-stable:2.17.0` | Imagen oficial; conservar también el digest de imagen usado en la evidencia |

La suite inicial vive en `frontend/tests/e2e/quality-smoke.spec.js` y se configura en `frontend/playwright.config.js`. Cubre el diálogo de edad y su foco, encabezados HTTP base, ausencia de desbordamiento a 320/768/1024/1440 px, el menú móvil a 390 × 844 y los campos/validación vacía del registro. En los estados visuales axe revisa WCAG 2.0/2.1/2.2 A/AA y falla por impacto crítico o serio. Playwright adjunta el JSON de axe al resultado.

La suite usa el servidor local predeterminado o una URL en `PLAYWRIGHT_BASE_URL`. Para proteger Staging intercepta las solicitudes de escritura del mismo origen: simula `POST /api/visits`, aborta el beacon `POST /cdn-cgi/rum` de Cloudflare y falla si intenta cualquier otra mutación. También aborta solicitudes al script de Turnstile para que no se genere ni resuelva un challenge. Estos recorridos no crean cuentas, pedidos, correos externos ni pagos. Playwright descarga el navegador compatible con la versión fijada; Lighthouse requiere Chrome instalado. ZAP Baseline usa un spider limitado y análisis pasivo; no equivale a un escaneo activo.

## Ruta elegida y mantenimiento

Se mantiene una sola suite propia y versionada. `node:test` cubre reglas, autorización, idempotencia e integración aislada; Playwright cubre los recorridos de navegador y usa axe en sus estados relevantes. Lighthouse y ZAP Baseline producen informes del candidato, revisados por una persona. No se agrega otro runner para repetir los mismos casos.

| Recurso | Decisión para fase 09 | Motivo y aplicación |
|---|---|---|
| Playwright + axe | Incorporar | Un recorrido de navegador sirve también para analizar accesibilidad; evita mantener dos suites de navegación. |
| `gh-secure` de GitHub Security Lab | No instalar para la línea base; reservar para una remediación aprobada | La API de GitHub permite leer estado de rama y funciones de seguridad sin una extensión. Usar `status` si la revisión de configuración lo amerita; `--dry-run` antes de cualquier aplicación. No instalar ni ejecutar cambios sobre reglas sin autorización. |
| Security Audit Skill de Cloudflare | No integrar al flujo base; usar bajo demanda | Puede aportar una revisión estructurada de código si ZAP y la inspección enfocada dejan una duda concreta. Leer y fijar su revisión antes de usarlo, cumplir su aislamiento y agregar hallazgos confirmados al único reporte de fase; nunca ejecutar su flujo contra Staging. |
| TestSprite | No incorporar al flujo base | Su generación y ejecución de pruebas se solapa con la suite propia y añade créditos, revisión y mantenimiento. Reconsiderar sólo si existe una carencia concreta que un piloto pequeño demuestre resolver. |
| Railway + Healthchecks.io | Elegir para la vigilancia mínima | Usar métricas y logs de Railway para diagnosticar. Un comprobador periódico externo recibe señales sólo tras verificar Frontend, API y actividad reciente del Worker; el job de respaldo informa éxito o fallo por separado. Probar que una señal omitida genera aviso. Los monitores configurables de Railway requieren Pro; no se contrata ese plan para repetir estas alertas. |
| Sentry | Diferir | Sirve para agrupar excepciones y seguir errores de aplicación. Añadirlo sólo si los logs del candidato no permiten diagnosticar fallos reales, con filtrado de datos y cuota definida. No sustituye una señal de vida ni la restauración de respaldo. |
| PostHog | No incorporar en fase 09 | Su análisis de producto, grabaciones y seguimiento de errores no son necesarios para estas puertas de calidad y exigirían otra política de captura de datos. Reconsiderarlo si se aprueba una necesidad de analítica concreta. |
| OpenGraph.to | Fuera del flujo base | Una comprobación puntual de vistas previas puede hacerse al preparar el dominio final en fase 10. |

En cada PR se ejecutan los checks locales/CI existentes y las pruebas afectadas. Al identificar un candidato de Staging se ejecutan los recorridos críticos y las auditorías de esta guía. Después de una corrección se repite el caso fallido y las comprobaciones afectadas; una nueva versión candidata requiere confirmar otra vez los checks y el recorrido crítico. Restauración, alertas y rollback se ensayan inicialmente y se repiten cuando cambia su mecanismo, esquema o configuración relevante. No repetir por rutina auditorías completas sobre el mismo candidato sin cambios ni dudas pendientes.

Conservar y revisar las pruebas generadas antes de versionarlas. Cada regla se comprueba en el nivel más bajo que dé confianza; el recorrido completo verifica que las piezas se integran, sin trasladar todas las combinaciones de pruebas unitarias al navegador. Turnstile real puede requerir intervención manual: registrar esa intervención y no mantener una automatización frágil ni desactivar el control.

## Plan de ejecución

Ejecuta los pasos en orden. Un paso pendiente que sea requisito de aceptación detiene el avance al siguiente bloque; no se sustituye por una herramienta simulada.

### 1. Acordar criterios, presupuesto y datos

Antes de medir, el responsable aprueba umbrales de rendimiento y SEO para móvil y escritorio, páginas, condiciones de medición y si algún umbral bloquea. A la fecha de esta guía no hay valores numéricos aprobados. Hasta que se acuerden, Lighthouse genera una línea base informativa y ninguna puntuación aislada bloquea.

La accesibilidad sí tiene una condición de aceptación definida: no debe quedar una violación axe crítica o seria reproducible sin corregir o sin excepción explícita y aceptada por el responsable; además se completa la revisión manual. Los umbrales de rendimiento/SEO no sustituyen revisar defectos funcionales confirmados.

Antes de recorridos que creen cuentas, envíen correo, creen pedidos o cambien carritos, prepara datos y buzones de prueba autorizados. Una visita, una prueba de registro o un Checkout puede producir actividad persistente o costos en Railway, Resend o Stripe. No ejecutes esos pasos en el entorno compartido hasta aprobar explícitamente datos, destinatarios, gasto y limpieza.

### 2. Validar código y dependencias del candidato

El workflow vigente de [CI](../../.github/workflows/ci.yml) corre en PR y push a `develop` y `main`. Usa Node `24.21.0` y lockfiles. Frontend ejecuta `npm test`, `npm run lint` y `npm run build`; Backend ejecuta `npm test`, `npm run lint`, `npm run prisma:validate` y `npm run prisma:generate`. No existe un script `build` de Backend. Comprueba los checks del commit exacto; una ejecución de otra rama o SHA no sustituye este requisito.

Railway despliega automáticamente los commits de la rama conectada cuando esa función está habilitada. Para cerrar el circuito CI/CD, comprueba en cada servicio la rama, el autodespliegue, **Wait for CI** y el SHA activo; configura protección de ramas y checks obligatorios para impedir que un merge con CI fallido llegue a `develop`. Un despliegue sano no demuestra que los checks pasaron ni que todos los servicios ejecutan el mismo candidato. [Autodespliegues de Railway](https://docs.railway.com/deployments/github-autodeploys).

Para reproducir localmente, usa Compose según la [guía local](../architecture/docker/COMPOSE.md), no una instalación de Node en el anfitrión. Antes del build revisa recursos y ejecuta cargas pesadas en serie:

```bash
free -h
docker stats --no-stream

docker compose exec frontend npm test
docker compose exec backend npm test
docker compose exec frontend npm run lint
docker compose exec backend npm run lint
docker compose exec backend npm run prisma:validate
docker compose exec backend npm run prisma:generate
docker compose run --rm --no-deps frontend npm run build
```

La suite de navegador corre con Node `24.21.0` y el Chromium que descarga Playwright `1.65.1`. CI instala el navegador con `npx playwright install --with-deps chromium` y ejecuta `npm run test:e2e`. Para correrla localmente sin instalar Node ni Playwright en el anfitrión, usa un contenedor efímero con el proyecto montado en solo lectura:

```bash
docker run --rm \
  -v "$PWD/frontend:/source:ro" \
  -w /tmp node:24.21.0-bookworm-slim bash -lc '
    mkdir -p phase09-frontend &&
    tar --exclude=node_modules --exclude=.next -cf - -C /source . | tar -xf - -C phase09-frontend &&
    cd phase09-frontend &&
    npm ci &&
    npx playwright install --with-deps chromium &&
    npm run test:e2e
  '
```

Para correr los mismos casos contra Staging, agrega `PLAYWRIGHT_BASE_URL="$STAGING_FRONTEND_URL"` antes de `docker run` y `-e PLAYWRIGHT_BASE_URL="$STAGING_FRONTEND_URL"` a sus argumentos. La suite no inicia un servidor local si esa variable está presente; mantiene activa la barrera contra escrituras.

Las pruebas de base de datos son optativas y escriben registros sintéticos que limpian al terminar. `backend/package.json` define `npm run test:db`; sin los flags, deja esos casos omitidos. Para ejecutarlas se requieren `CART_DATABASE_TEST=1`, `CHECKOUT_DATABASE_TEST=1` y `EMAIL_DELIVERY_DATABASE_TEST=1`, PostgreSQL con migraciones aplicadas y Mailpit. La composición de [Phase 09](../../compose.phase09.yaml) fija la imagen Backend y deja que `-p` cree una red y volumen exclusivos; no uses el volumen persistente `postgres_data` de desarrollo ni una base remota.

Construye primero la imagen Backend del proyecto local base y confirma que los puertos de ejemplo estén libres. El identificador `QUALITY_PROJECT` debe ser nuevo y usarse sin cambios. Comprueba la etiqueta del volumen antes de borrar recursos:

```bash
docker compose build backend
QUALITY_PROJECT="phase09-quality-$(date +%Y%m%d%H%M%S)"

POSTGRES_PORT=25432 BACKEND_PORT=25400 MAILPIT_PORT=28025 \
  docker compose -f compose.yaml -f compose.phase09.yaml -p "$QUALITY_PROJECT" \
  up --no-build --detach --wait --wait-timeout 180 postgres mailpit backend

docker compose -f compose.yaml -f compose.phase09.yaml -p "$QUALITY_PROJECT" \
  exec -T -e CART_DATABASE_TEST=1 -e CHECKOUT_DATABASE_TEST=1 \
  -e EMAIL_DELIVERY_DATABASE_TEST=1 backend npm run test:db

docker volume inspect "${QUALITY_PROJECT}_postgres_data" \
  --format '{{.Name}} {{index .Labels "com.docker.compose.project"}}'

docker compose -f compose.yaml -f compose.phase09.yaml -p "$QUALITY_PROJECT" \
  down --volumes --remove-orphans
```

La última orden elimina sólo el proyecto temporal y su volumen. Nunca la sustituyas por `down --volumes` sobre el proyecto local normal.

Para revisar dependencias, ejecuta `npm audit --audit-level=high` y `npm audit signatures` dentro de cada proyecto con su lockfile correspondiente. Investiga si los hallazgos son alcanzables en runtime, build, CI o despliegue; no apliques correcciones forzadas. Una firma o atestación válida respalda procedencia del registro, no demuestra que el paquete sea seguro. Revisa cambios de dependencias, scripts de instalación, acciones de GitHub fijadas por commit y que ninguna variable secreta se haya incluido en código o informes.

### 3. Recorrer Staging de forma controlada

Usa perfiles de navegador temporales, la matriz de [MVP_SCOPE](../MVP_SCOPE.md) y los contratos de [landing](../contracts/03-LANDING.md), [cuentas](../contracts/04-ACCOUNTS-PROFILE.md), [carritos](../contracts/05-CARTS.md) y [checkout/pedidos](../contracts/06-CHECKOUT-ORDERS.md). Cubre los tamaños definidos por los contratos: 320, 768, 1024 y 1440 px; incluye escritorio y móvil reales o emulación declarada.

La suite inicial de Staging cubre sólo lectura y validación del navegador; no sustituye la repetición de recorridos transaccionales si cambia el código de aplicación. Verifica el SHA activo antes de atribuir resultados.

La suite Playwright debe cubrir, según los datos que el responsable autorice:

1. Landing, edad, navegación, catálogo, imágenes y carrito de invitado.
2. Registro pendiente, Turnstile real, correo de confirmación, login, logout y persistencia de sesión.
3. Recuperación de contraseña y acceso privado a perfil y pedidos.
4. Transferencia de carrito de invitado, edición y disponibilidad de productos.
5. Checkout con precios del servidor, Stripe `test`, retorno pendiente, webhook firmado, pedido propio y carrito actualizado.
6. Correo de cuenta y de compra, con el PDF adjunto y los estados de error/reintento relevantes.

Registra pasos, precondiciones y resultado por recorrido. Usa la verificación real de Turnstile y el webhook firmado; un challenge desactivado, un correo simulado o una confirmación desde el retorno del navegador no aprueban la integración de Staging. Los datos de compra son de prueba, no se crean pagos live ni se publican credenciales, cookies o tokens en trazas.

### 4. Revisar accesibilidad y correos

Con `@axe-core/playwright`, analiza páginas y estados importantes del recorrido; conserva el JSON de hallazgos. Revisa cada incidencia para confirmar el nodo, severidad, impacto y reproducción. No suprimas reglas para obtener un resultado verde. La automatización no acredita conformidad completa.

Completa revisión manual con teclado (orden, foco visible, activación y ausencia de trampas), lector de pantalla (estructura, etiquetas, errores y anuncios), zoom al 200%, contraste, estados de formulario y controles táctiles. Sigue los criterios de accesibilidad ya escritos en los contratos afectados. Registra lector, navegador, sistema operativo y tamaños usados.

La revisión visual de correos en iPhone queda fuera de esta fase. En los recorridos funcionales sí se comprueba la entrega de confirmación, recuperación y compra, incluido el PDF; registra su resultado sin exponer direcciones, tokens ni contenido personal. Si el responsable prioriza una revisión visual en clientes web o de escritorio, debe acordar cuáles antes de ejecutarla; no forma parte del bloqueo base de fase 09.

### 5. Medir rendimiento y SEO

Ejecuta Lighthouse sobre la landing pública de Staging. Repite tres veces por perfil móvil y escritorio en condiciones comparables y compara medianas; guarda informes JSON, versión de Chrome, Lighthouse, fecha, commit y URL. El perfil predeterminado de Lighthouse es móvil; indica `--preset=desktop` para escritorio.

```bash
npx --yes lighthouse@13.6.0 "$STAGING_FRONTEND_URL/" \
  --blocked-url-patterns='.*/api/visits.*' --blocked-url-patterns='.*/cdn-cgi/rum.*' \
  --no-enable-error-reporting --output=json --output-path=reports/lighthouse-mobile-01.json --quiet
npx --yes lighthouse@13.6.0 "$STAGING_FRONTEND_URL/" \
  --preset=desktop --blocked-url-patterns='.*/api/visits.*' --blocked-url-patterns='.*/cdn-cgi/rum.*' \
  --no-enable-error-reporting --output=json --output-path=reports/lighthouse-desktop-01.json --quiet
```

Repite con nombres `-02` y `-03`. Compara las categorías y las métricas del informe, explica variación o causa antes de proponer una corrección y evalúa la superficie permitida por el MVP. Confirma que la landing de Staging responde con `X-Robots-Tag: noindex` y que la ruta de cuenta conserva `noindex`. Revisa `robots.txt` y verifica que no bloquee `/`, pues el crawler debe poder leer la cabecera; los comentarios genéricos de Content Signals de Cloudflare no son una regla de no indexación. No agregues URLs de cuenta/checkout al objetivo SEO ni publiques informes con sesiones.

Compara con los objetivos acordados en el paso 1. Sin objetivos firmados previamente, registra la línea base como informativa y deja la puerta de bloqueo pendiente de acuerdo. Lighthouse por sí solo no certifica rendimiento de usuarios reales ni SEO.

### 6. Analizar seguridad de Staging y configuración

Ejecuta ZAP Baseline **sólo en modo pasivo** contra los hostnames públicos propios de Staging previamente aprobados. No uses ZAP Full Scan, active scan, fuzzing, brute force, pruebas de carga ni objetivos de Stripe, Cloudflare o Resend. El spider genera solicitudes HTTP y puede consumir recursos del entorno; confirma presupuesto y ventana antes de iniciarlo.

La resistencia a intentos repetidos de acceso se verifica aparte con pruebas deterministas de los límites de autenticación: cuenta y datos sintéticos, número acotado de solicitudes, respuesta `429`, aislamiento entre clientes detrás del proxy y recuperación después de la ventana. La prueba se prepara primero en local aislado; cualquier ejecución remota se acota a Staging y no usa cuentas de terceros. ZAP Baseline no cubre este caso y un ataque de fuerza bruta masivo no es criterio de cierre.

```bash
mkdir -p reports/zap
docker run --rm -v "$PWD/reports/zap:/zap/wrk/:rw" -t \
  zaproxy/zap-stable:2.17.0 zap-baseline.py \
  -t "$STAGING_FRONTEND_URL" -m 1 \
  -J zap.json -r zap.html
```

No uses `-I` ni conviertas advertencias en exclusiones generales. Revisa alertas contra evidencia reproducible y los contratos/código de autenticación, autorización, cookies, proxy/orígenes, Turnstile, Stripe webhooks, manejo de errores, límites, secretos y dependencias. Para cada hallazgo, verifica impacto y ruta, separa falsos positivos con evidencia y asigna seguimiento a los restantes. No se considera una auditoría completa sólo porque ZAP no reporte alertas.

Verificamos encabezados en la respuesta HTML y en recursos estáticos. El candidato debe enviar HSTS sin `includeSubDomains`, `X-Content-Type-Options`, protección contra framing, `Referrer-Policy` y `Permissions-Policy`, y no exponer `X-Powered-By`. Revisamos CSP y las políticas COEP/COOP/CORP por separado antes de activarlas: comprobamos scripts, mapas, medios externos y los demás orígenes que usa nuestro sistema. En Next.js, la CSP con nonce exige renderizado dinámico y puede desactivar prerenderizado y caché parcial; Turnstile requiere permitir sus scripts, iframes y conexiones. No copiamos una política genérica sin probar los recorridos y la consola.

Para cerrar CSP, prepara una política específica en `Content-Security-Policy-Report-Only`, revisa violaciones en los recorridos de tienda, cuenta, Turnstile y Checkout, y luego aplica la política efectiva compatible. Si una directiva requiere una excepción o cambia el renderizado y el rendimiento, registra la decisión y repite las comprobaciones afectadas. No declares CSP aceptada sólo por agregar el encabezado.

Antes de aceptar, no debe quedar un hallazgo crítico o alto confirmado y reproducible sin corregir. Cambios de código/configuración requieren su propia revisión y una nueva validación del candidato correspondiente.

### 7. Comprobar respaldo, restauración, alertas y rollback

El plan de recuperación acordado para preparar Production es independiente de los snapshots de Railway: un job diario `pg_dump` con destino privado fuera de Railway, definido en [POSTGRES-BACKUPS.md](../architecture/services/POSTGRES-BACKUPS.md). Aún no está implementado; el responsable debe comprobar tamaño, retención, egreso y costo antes de habilitarlo. Los respaldos de volumen de Railway pueden evaluarse como una capa adicional y generar costos de almacenamiento; PITR puede generar consumo de almacenamiento y egreso. La restauración nativa de volumen se aplica al mismo proyecto/entorno y puede cambiar el volumen montado y redesplegar el servicio. Por eso, no uses la acción Restore sobre una base compartida como ensayo aislado.

Para aceptar recuperación, restaura una copia aprobada o datos sintéticos en PostgreSQL aislado (otro proyecto temporal o entorno local efímero), verifica migraciones, lectura de registros esperados, `/health` y una operación de aplicación segura; confirma que el origen no cambió. El responsable elimina el destino temporal sólo después de preservar la evidencia necesaria y revisar costos. No copies PII real si basta un dataset sintético. El simulacro específico de `pg_dump`, incluido el tratamiento de copias productivas, debe seguir la guía de respaldos.

Railway ofrece métricas y logs para diagnosticar CPU, memoria, latencia y errores; sus monitores configurables requieren el plan Pro. Para avisos sin subir de plan, prepara un comprobador programado que consulte Frontend, `/health` de Backend y la frescura del latido del Worker, y sólo entonces envíe una señal de éxito a Healthchecks.io. El job de respaldo envía otra señal después de verificar su archivo cifrado en R2. Configura destinatarios, periodicidad y margen de alerta, y demuestra con un fallo controlado que la falta de señal produce un aviso. Ninguna señal debe incluir credenciales, datos de usuarios o URLs privadas.

Ensaya rollback en un entorno aislado o en una ventana autorizada. Confirma qué versión de Frontend, Backend y worker volvería, compatibilidad de migraciones y configuración, y qué respuesta de salud se espera. Railway rollback revierte la imagen y las variables personalizadas de ese despliegue y depende de la retención del plan. No hagas rollback en el Staging compartido ni ejecutes un despliegue desde esta fase sin autorización específica.

### 8. Aceptar o dejar pendiente

Acepta fase 09 sólo cuando:

- el commit candidato y el entorno están identificados, y los checks de ese mismo commit pasan;
- los recorridos requeridos están reproducidos en el entorno y con datos autorizados;
- axe y la revisión manual cumplen sus criterios; la entrega funcional de correo y PDF está comprobada, sin condicionar el cierre a su presentación visual en iPhone;
- Lighthouse tiene objetivos aprobados antes de aplicar bloqueos y los resultados se compararon en condiciones repetibles;
- ZAP fue pasivo, se revisaron hallazgos reproducibles y no quedan hallazgos críticos/altos confirmados sin resolver;
- dependencias y configuración están revisadas; respaldo/restauración aislada, alertas y ensayo de rollback tienen evidencia;
- el responsable del proyecto acepta la evidencia y los seguimientos pendientes.

Una prueba omitida, un CAPTCHA bloqueado, un proveedor simulado, un candidato sin SHA confirmado, una operación no autorizada o un recurso no preparado se registra como pendiente, no como aprobado. La aceptación de fase 09 no autoriza merge, despliegue a Producción, ventas ni activación de Stripe live.

## Límites de operación

- No desplegar, fusionar, cambiar configuración de Railway, alterar datos persistentes de Staging ni ejecutar rollback sin autorización específica.
- No activar Stripe live, crear cobros reales ni cambiar Checkout fuera del modo de prueba.
- No incurrir en costos externos, mejorar plan, crear recursos pagados, cambiar DNS, activar PITR/respaldos de pago o contratar observabilidad sin aprobación de presupuesto.
- No usar datos, cuentas, destinatarios, sesiones o secretos reales en los informes; restringe trazas, capturas y correos que pudieran contenerlos.
- No afirmar que una herramienta, integración o check está instalado o aceptado sólo porque esta guía lo menciona.

## Evidencia mínima y conservación

Para cada bloque de aceptación conserva, como mínimo:

| Campo | Qué registrar |
|---|---|
| Entorno | `Staging`, región, servicios revisados y URL sin parámetros privados |
| Fecha | Fecha y hora con zona horaria |
| Commit | SHA completo del candidato; SHA de `Frontend`, `Backend` y `worker` si difieren |
| Ejecución | Comando/configuración, navegador y versiones de herramientas usadas |
| Resultado | Aprobado, pendiente o bloqueado, con el criterio concreto y responsable |
| Artefactos | Enlaces restringidos a checks, informes, capturas y evidencia de recuperación |

No subas secretos, tokens, cookies, datos personales, cuerpo de correos ni exportaciones de base de datos al repositorio. Conserva informes según la política acordada y elimina datos de prueba al cierre. El roadmap resume el resultado de fase y sólo identifica entorno, fecha o commit cuando son necesarios para explicar una aceptación o un bloqueo vigente; los detalles de ejecución viven en checks o artefactos restringidos. No generes un Markdown por herramienta: informa en la conversación de la fase en Codex Desktop los resultados y las correcciones por bloque; conserva los JSON técnicos como artefactos locales/restringidos.

## Referencias oficiales

- [GitHub Security Lab: gh-secure](https://github.com/GitHubSecurityLab/gh-secure) · [Cloudflare: Security Audit Skill](https://github.com/cloudflare/security-audit-skill) · [Sentry para Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/) · [TestSprite: capacidades y cuotas](https://www.testsprite.com/pricing)
- [Next.js: encabezados](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers) · [Next.js: CSP](https://nextjs.org/docs/app/guides/content-security-policy) · [Next.js: desactivar `X-Powered-By`](https://nextjs.org/docs/app/api-reference/config/next-config-js/poweredByHeader) · [Cloudflare Turnstile: CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)
- [Cloudflare: endpoint `/cdn-cgi/`](https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/) · [Cloudflare: RUM beacon](https://developers.cloudflare.com/speed/observatory/rum-beacon/)
- [npm: audit, firmas y atestaciones](https://docs.npmjs.com/cli/npm-audit/)

- [Playwright: instalación y ejecución](https://playwright.dev/docs/intro) · [Accesibilidad con Playwright](https://playwright.dev/docs/accessibility-testing) · [Navegadores de Playwright](https://playwright.dev/docs/browsers)
- [Versiones de `@playwright/test`](https://www.npmjs.com/package/%40playwright/test?activeTab=versions) · [Versiones de `@axe-core/playwright`](https://www.npmjs.com/package/%40axe-core/playwright?activeTab=versions) · [Versión de Lighthouse](https://www.npmjs.com/package/lighthouse)
- [Lighthouse: CLI e informes](https://developer.chrome.com/docs/lighthouse/overview) · [Puntuación y variación](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring)
- [ZAP Baseline Scan](https://www.zaproxy.org/docs/docker/baseline-scan/) · [Imágenes Docker de ZAP](https://www.zaproxy.org/docs/docker/about/)
- [Railway: respaldos de volumen](https://docs.railway.com/volumes/backups) · [PITR y costos](https://docs.railway.com/volumes/point-in-time-recovery) · [métricas](https://docs.railway.com/observability/metrics) · [monitores](https://docs.railway.com/observability) · [rollback](https://docs.railway.com/deployments/deployment-actions)
- [Railway: autodespliegue y Wait for CI](https://docs.railway.com/deployments/github-autodeploys) · [Healthchecks.io: señales y alertas](https://healthchecks.io/docs/) · [Healthchecks.io: plan gratuito](https://healthchecks.io/pricing/)
- [Stripe: webhook](https://docs.stripe.com/webhooks) · [Cloudflare Turnstile: validación server-side](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
