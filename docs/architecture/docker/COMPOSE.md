# Infraestructura local con Docker Compose

Compose ejecuta PostgreSQL, Mailpit, la API Express, un worker Node.js y el frontend Next.js en la red bridge del proyecto. Dentro de Compose, los servicios se resuelven por nombre; los puertos publicados conectan el anfitrión con esos servicios. Los puertos publicados usan localhost por defecto. El script `scripts/dev-lan.sh` habilita y revierte el acceso desde la red local.

## Requisitos y convenciones

- Docker Engine 28 o posterior en ejecución, Docker CLI y el plugin Docker Compose 2.17.0 o posterior, invocado como `docker compose`. Compose 2.17.0 incorporó `--wait-timeout`, que se usa al iniciar el entorno. En Docker Engine anterior a 28, otros equipos del mismo segmento de red podían alcanzar puertos publicados en localhost. Consulta la [referencia de Compose](https://docs.docker.com/compose/install/), las [notas de Compose 2.17.0](https://github.com/docker/compose/releases/tag/v2.17.0) y la documentación de [publicación de puertos de Docker](https://docs.docker.com/engine/network/port-publishing/).
- Git, `curl` y una terminal Bash en Linux, macOS o WSL 2.
- No hace falta instalar Node.js ni npm en el anfitrión: las imágenes instalan dependencias con `npm ci` a partir de los lockfiles y las aplicaciones se ejecutan en Compose.
- `.env.example` contiene valores locales ilustrativos; `.env` no se versiona. No guardes secretos reales en el repositorio.

## Red y servicios

Los contenedores se comunican por el nombre del servicio. El navegador del anfitrión usa los puertos publicados.

~~~mermaid
flowchart LR
    Browser["Navegador del anfitrión"]
    subgraph Compose["Red privada de Compose"]
        Frontend["frontend<br/>Next.js :3000"]
        Backend["backend<br/>Express :3000"]
        PostgreSQL[("postgres :5432")]
        Worker["worker<br/>Node.js"]
        Mailpit["mailpit<br/>SMTP :1025 · UI :8025"]
    end

    Browser -->|"localhost:3000"| Frontend
    Browser -->|"localhost:4000"| Backend
    Browser -->|"localhost:8025"| Mailpit
    Frontend -->|"backend:3000 · SSR"| Backend
    Backend -->|"postgres:5432 · Prisma"| PostgreSQL
    Worker -->|"postgres:5432 · latido"| PostgreSQL
    Worker -->|"mailpit:1025 · comprobación SMTP"| Mailpit
~~~

| Servicio | Dirección del anfitrión | Dirección interna | Función |
|---|---|---|---|
| Frontend | [http://localhost:3000](http://localhost:3000) | `frontend:3000` | Next.js en modo desarrollo |
| API | [http://localhost:4000/health](http://localhost:4000/health) | `backend:3000` | Express; salud y conectividad con PostgreSQL |
| API | [http://localhost:4000/api/hello](http://localhost:4000/api/hello) | `backend:3000` | Comprobación de comunicación frontend/API |
| PostgreSQL | `localhost:5432` | `postgres:5432` | Base local con volumen persistente |
| Mailpit | [http://localhost:8025](http://localhost:8025) | `mailpit:8025` | Bandeja web de correo de desarrollo |
| SMTP de Mailpit | No publicado al anfitrión | `mailpit:1025` | Envío desde el worker |
| Worker | Sin puerto publicado | PostgreSQL y Mailpit en la red privada | Escribe un latido; `worker:mail-smoke` comprueba el envío SMTP |

El frontend consulta la API durante el render del servidor mediante `http://backend:3000`. El navegador no necesita resolver nombres internos de Compose. La red bridge y la dirección de publicación del puerto en el anfitrión son configuraciones distintas.

## Versiones de ejecución

Las imágenes y dependencias están fijadas en los Dockerfiles, `compose.yaml` y lockfiles del repositorio. Consulta los [tags de Node.js](https://github.com/docker-library/official-images/blob/master/library/node), la [imagen oficial de PostgreSQL](https://hub.docker.com/_/postgres) y la [documentación Docker de Mailpit](https://mailpit.axllent.org/docs/install/docker/) al revisar actualizaciones.

| Componente | Versión |
|---|---|
| Node.js | `24.21.0-bookworm-slim` |
| PostgreSQL | `18.6-bookworm` |
| Mailpit | `v1.31.5` |
| Next.js | `16.4.1` |
| React y React DOM | `19.3.0` |
| Tailwind CSS y `@tailwindcss/postcss` | `4.3.3` |
| PostCSS, fijado en el lockfile | `8.5.23` |
| Express | `5.3.0` |
| Prisma CLI, Client y adaptador PostgreSQL | `7.10.1` |
| `pg` | `8.23.1` |
| Nodemailer | `10.2.1` |
| ESLint | `10.14.0` |
| `@eslint/js` | `10.0.1` |
| `@next/eslint-plugin-next` | `16.4.1` |
| `globals` | `17.13.0` |
| eslint-plugin-react-hooks | `7.1.1` |

Los manifiestos y lockfiles fijan las dependencias completas; Compose las instala con `npm ci`. La integración de Tailwind CSS 4 usa `@tailwindcss/postcss` en [la configuración de PostCSS](../../../frontend/postcss.config.mjs) y `@import "tailwindcss"` en [el CSS global](../../../frontend/src/app/globals.css).

## Componentes de la infraestructura

| Componente | Configuración y comportamiento |
|---|---|
| Frontend | [Dockerfile](../../../frontend/Dockerfile) usa Node.js 24, instala desde el lockfile y ejecuta Next.js como el usuario `node`. Compose monta `src/`, `tests/` y `public/`; los cambios de código se reflejan durante el desarrollo. Cambios en `next.config.mjs`, Dockerfile o dependencias requieren reconstruir la imagen. `INTERNAL_API_URL` apunta a `http://backend:3000` para SSR. |
| API | [Dockerfile](../../../backend/Dockerfile) instala OpenSSL para Prisma, instala desde el lockfile y genera el cliente durante la construcción. Al iniciar, el backend regenera Prisma Client con el esquema montado, aplica las migraciones versionadas y arranca Express. `/health` consulta PostgreSQL y devuelve `{"status":"ok","database":"connected"}` o HTTP 503 si la consulta falla; `/api/hello` comprueba la comunicación frontend/API. |
| Prisma | [Esquema](../../../backend/prisma/schema.prisma) genera el cliente en `backend/generated/prisma`, fuera del montaje `src/`. [La configuración CLI](../../../backend/prisma.config.ts) toma `DATABASE_URL` del entorno. El adaptador PostgreSQL conecta Prisma con el servicio `postgres`. |
| Worker | Usa la imagen del backend, pero ejecuta el proceso `worker:dev`. Registra en `worker_heartbeats` un latido cada 10 segundos; su health check considera saludable un latido de menos de 60 segundos. No publica puerto HTTP. |
| PostgreSQL | Usa PostgreSQL 18 y persiste sus datos en el volumen `postgres_data`, montado en `/var/lib/postgresql`. El puerto del anfitrión es configurable y queda enlazado a `127.0.0.1` por defecto. |
| Mailpit | Recibe correo por SMTP en `mailpit:1025`, sólo dentro de Compose. La bandeja web usa el puerto 8025 del anfitrión y no tiene volumen persistente; sus mensajes se pierden al recrear el contenedor. |

La conexión a PostgreSQL se comparte por `DATABASE_URL` en `.env`. Si cambias la base, el usuario o la contraseña definidos para PostgreSQL, actualiza la URL con los mismos valores. La variable de compilación usada para generar Prisma Client no conecta a una base; la URL real se usa cuando se ejecutan los servicios.

## Configurar y levantar

Desde la raíz del repositorio, crea la configuración local. `cp -n` conserva cualquier `.env` existente:

~~~bash
cp -n .env.example .env
~~~

El archivo `.env.example` contiene valores de desarrollo y no contiene secretos reales. `.env` está excluido de Git. Si cambias usuario, contraseña o nombre de base, actualiza también `DATABASE_URL`; los caracteres especiales de una contraseña deben codificarse para URL. Cambiar las variables de inicialización de PostgreSQL no modifica las credenciales de un volumen que ya fue inicializado.

Valida la configuración, construye las imágenes y espera los health checks:

~~~bash
docker compose config --quiet
docker compose up --build --detach --wait --wait-timeout 180
docker compose ps
~~~

En el primer arranque, Compose descarga las imágenes de los servicios, construye frontend y backend, instala dependencias con `npm ci`, y crea la red y el volumen de PostgreSQL. El backend genera Prisma Client y aplica las migraciones versionadas antes de iniciar Express. El worker y el frontend arrancan después de que sus dependencias estén saludables. Si el arranque falla o agota el tiempo de espera, revisa `docker compose ps` y `docker compose logs --follow <servicio>` para encontrar el contenedor que no quedó saludable.

### Decisiones de Compose

- Los contenedores se conectan usando DNS de servicio: el backend y el worker usan `postgres:5432`; el frontend consulta `backend:3000` durante el render del servidor; el SMTP de Mailpit usa `mailpit:1025`. Dentro de un contenedor, `localhost` señala al propio contenedor.
- El anfitrión publica frontend, API, PostgreSQL y la bandeja web de Mailpit en las direcciones definidas en `.env`; por defecto son `127.0.0.1`. SMTP de Mailpit no se publica.
- PostgreSQL conserva sus datos en el volumen nombrado `postgres_data`, montado en `/var/lib/postgresql`, la ruta de persistencia de la imagen PostgreSQL 18. `docker compose down` conserva ese volumen.
- El backend genera Prisma Client y aplica migraciones existentes antes de iniciar Express. El worker registra un latido en PostgreSQL; su health check verifica que el latido siga reciente.
- Los montajes de `src/` y `prisma/` permiten editar backend y worker desde el anfitrión durante el desarrollo. El cliente Prisma generado permanece fuera del montaje de `src/`.
- El frontend no fija `NODE_ENV` en Compose ni en su Dockerfile. Next.js selecciona el modo según el comando: `next dev` inicia desarrollo y `next build` genera el build optimizado.

## Comprobaciones

Comprueba el estado de los servicios y la respuesta de la API:

~~~bash
docker compose ps
curl --fail --show-error --silent http://localhost:4000/health
curl --fail --show-error --silent http://localhost:4000/api/hello
curl --fail --show-error --silent --output /dev/null --write-out 'HTTP %{http_code}\n' http://localhost:3000
~~~

`/health` consulta PostgreSQL y devuelve el estado de la conexión. La página del frontend muestra la respuesta obtenida desde la API. El health check del worker comprueba su latido en PostgreSQL.

Valida Prisma y el historial de migraciones:

~~~bash
docker compose exec backend npm run prisma:validate
docker compose exec backend npm run prisma:migrate:status
~~~

Al cambiar `backend/prisma/schema.prisma`, crea una migración local y regenera Prisma Client:

~~~bash
docker compose exec \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  backend npm run prisma:migrate:dev -- --name nombre_descriptivo

docker compose exec backend npm run prisma:generate
~~~

`prisma migrate dev` crea y aplica migraciones de desarrollo. Prisma 7 no ejecuta `prisma generate` automáticamente después de ese comando.

Envía un correo de comprobación al SMTP privado de Mailpit con el comando de verificación del worker:

~~~bash
docker compose exec worker npm run worker:mail-smoke
~~~

Confirma el mensaje en [Mailpit](http://localhost:8025). La bandeja es temporal y se vacía al recrear el contenedor de Mailpit.

Ejecuta las pruebas y ESLint dentro de los contenedores:

~~~bash
docker compose exec frontend npm test
docker compose exec backend npm test
docker compose exec frontend npm run lint
docker compose exec backend npm run lint
~~~

Comprueba un build optimizado del frontend:

~~~bash
docker compose run --rm --no-deps frontend npm run build
~~~

## Integración continua

`.github/workflows/ci.yml` define los checks para pull requests a `develop` y `main` y pushes a esas ramas. El job frontend instala desde el lockfile, ejecuta pruebas y ESLint, y construye Next.js. El job backend ejecuta pruebas, ESLint y validación y generación de Prisma Client. Las acciones de GitHub se fijan por commit.

## Acceso desde la LAN

Desde la raíz del repositorio, activa el acceso con la IPv4 asignada al anfitrión. El script valida la dirección y lee los puertos de `.env`:

~~~bash
scripts/dev-lan.sh up 192.168.100.2
~~~

Sustituye la dirección si cambia la IPv4 del equipo. Con los puertos predeterminados, abre:

- Frontend: `http://192.168.100.2:3000`
- Salud de la API: `http://192.168.100.2:4000/health`
- Mailpit: `http://192.168.100.2:8025`

El modo LAN publica frontend, API y la bandeja web de Mailpit en todas las interfaces del anfitrión (`0.0.0.0`). PostgreSQL conserva el enlace definido en `.env` —localhost por defecto— y el SMTP sigue privado dentro de Compose. El firewall del equipo y las reglas de la red deben permitir el tráfico a los puertos publicados.

El script escribe los enlaces temporales en `.env.dev-lan` y pasa ese archivo a Compose después de `.env`, de modo que sólo sustituye los valores necesarios para LAN. No modifica `.env` ni elimina el volumen de PostgreSQL. Si cambia la IPv4 o alguno de los puertos configurados, ejecuta `up` con la dirección actual y usa las URL que imprime el script.

Desactiva el modo LAN y restaura los enlaces de `.env`:

~~~bash
scripts/dev-lan.sh off
~~~

El script recrea frontend, API, worker y Mailpit con la configuración base y elimina `.env.dev-lan`; PostgreSQL y sus datos se conservan.

## Reiniciar, detener y limpiar

Reinicia procesos sin recrear los contenedores:

~~~bash
docker compose restart frontend backend worker
~~~

Recrea servicios para aplicar cambios en variables o en `compose.yaml`:

~~~bash
docker compose up --detach --force-recreate frontend backend worker
~~~

Reconstruye las imágenes tras cambiar un Dockerfile o una dependencia:

~~~bash
docker compose up --build --detach --force-recreate
~~~

Consulta los logs:

~~~bash
docker compose logs --follow
docker compose logs --follow backend
~~~

Detén los servicios conservando el volumen de PostgreSQL:

~~~bash
docker compose down
~~~

Borra también el volumen y los datos locales:

~~~bash
docker compose down --volumes
~~~

`docker compose down --volumes` elimina permanentemente los datos locales de PostgreSQL.
