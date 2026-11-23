# Runbook maestro de preparación de Producción

> **Estado:** plan de implementación. No acredita que exista un entorno Production ni autoriza cambios en proveedores, DNS, pagos o envíos reales.

Esta guía ordena el paso a Producción y enlaza las instrucciones detalladas de cada servicio. Cada guía de servicio es la fuente de verdad de sus variables y pasos; este documento coordina dependencias, separa entornos y registra las puertas de salida.

## Perfiles y separación de entornos

Nuestro proyecto mantiene Local, Railway Staging y Production como entornos separados. El DNS público de `srmictlan.com` está delegado a Cloudflare y conecta el dominio al Frontend de Staging; este hostname no representa Production. Antes de publicar Production, conectamos el dominio sólo a los servicios productivos aprobados y verificamos el cambio de DNS.

| Perfil | Propósito | Datos y credenciales | Regla operativa |
|---|---|---|---|
| Local | Desarrollo en Compose, Mailpit por defecto, Resend opcional y Stripe de prueba | Base y `.env` locales; no reutilizamos secretos productivos | Aislamos datos remotos; Resend sólo envía correo externo si se activa expresamente |
| Staging | Integración del candidato de este repositorio | Base, Stripe test, Resend, Turnstile y medios no productivos | Verificamos despliegue y SHA antes de cada operación |
| Production | Servicio público y datos reales | Recursos y credenciales independientes; Checkout deshabilitado durante la preparación | Habilitamos tráfico, indexación y pagos sólo después de aceptar las puertas de salida |

Conservamos fecha, entorno, SHA y evidencia detallada en los registros del despliegue. Actualizamos el [roadmap](../ROADMAP.md) sólo si una operación cambia un resultado de fase, una decisión importante o un bloqueo de aceptación; nunca guardamos secretos.

## Mapa de servicios y fuentes de verdad

| Servicio | Función | Guía detallada | Regla entre entornos |
|---|---|---|---|
| Neubox | Registro del dominio, renovación y delegación de nameservers | [NEUBOX.md](../architecture/services/NEUBOX.md) | El dominio es compartido; Neubox no tiene un entorno de aplicación Staging/Production |
| Cloudflare público | DNS autoritativo, proxy/CDN, TLS y controles del borde | [CLOUDFLARE.md](../architecture/services/CLOUDFLARE.md) | La zona del dominio público sirve a Production; Staging debe usar hostname separado |
| Cloudflare R2 | Medios públicos y, por separado, archivos privados de respaldo | [R2.md](../architecture/services/R2.md), [POSTGRES-BACKUPS.md](../architecture/services/POSTGRES-BACKUPS.md) | Buckets y permisos independientes; nunca mezclar medios públicos y respaldos privados |
| Railway | Frontend, API, PostgreSQL, Worker y tarea programada de respaldo | [RAILWAY.md](../architecture/services/RAILWAY.md) | Proyecto/entorno, base, variables y dominios separados |
| Resend | Envío de correo transaccional | [RESEND.md](../architecture/services/RESEND.md) | Claves, remitentes, dominios y destinatarios de prueba separados |
| Stripe | Checkout y confirmación por webhook | [STRIPE.md](../architecture/services/STRIPE.md) | Staging usa test; Production mantiene Checkout bloqueado hasta autorización live |

## Secuencia de implementación

Avanza en orden y registra el resultado de cada puerta antes de seguir. Los comandos y cambios externos se ejecutan sólo durante una fase autorizada de implementación; este plan no los ejecuta.

### 0. Reconstruir el inventario vigente

- Seleccionar el proyecto y el entorno Railway de este repositorio. Confirmar servicios, base, hostnames y SHA antes de aplicar cambios.
- Leer la zona DNS actualmente autoritativa en Cloudflare y comparar apex, `www`, API, correo, Resend, verificaciones y cualquier registro de R2 con el inventario de Neubox y las pantallas de los proveedores.
- Confirmar que los buckets de medios Local, Staging y Production son independientes y que el bucket de respaldo PostgreSQL permanece privado.
- Confirmar si el dominio/subdominio de envío continúa verificado en Resend y si el webhook Stripe de prueba apunta al Backend del Staging actual.
- No borrar registros, webhooks ni buckets durante el inventario. Documentar qué registro está obsoleto y su reemplazo antes de editarlo.

**Puerta:** el inventario coincide con los paneles actuales de los proveedores, identifica la autoridad DNS y no incluye secretos.

### 1. Asegurar dominio y capa pública

1. Revisar en Neubox titularidad, acceso, renovación y nameservers configurados.
2. Tratar Cloudflare como DNS autoritativo sólo si la delegación pública lo confirma. Administrar los registros en una sola zona autoritativa; no editar una zona cPanel de Neubox si no es la activa.
3. Preparar los hostnames de frontend y API en Production con los valores exactos que Railway entregue. Mantener PostgreSQL y Worker sin hostname público.
4. Preservar MX, SPF, DKIM, DMARC y verificaciones de Resend. Revisar TLS de origen antes de activar proxy o controles que cambien el tráfico.
5. Decidir por separado las políticas de bots de Cloudflare (búsqueda, entrenamiento y agentes). Una política de Cloudflare no sustituye `robots.txt`, `noindex` ni la decisión de indexar la tienda.

**Puerta:** `srmictlan.com` y `www` llegan al destino productivo aprobado; TLS es válido; los registros de correo sobreviven; el resultado coincide con la decisión SEO y las políticas del borde están registradas.

### 2. Preparar los medios productivos

- Crear un bucket de medios distinto del bucket local/Staging y usar el dominio público aprobado para los recursos.
- Cargar y revisar el inventario de imágenes con claves estables; configurar el origen correspondiente en Frontend, Backend y Checkout.
- Mantener el bucket de medios público sólo para contenido destinado a visitantes. No guardar respaldos de PostgreSQL allí.

**Puerta:** las imágenes del catálogo y las que Stripe requiere responden por HTTPS desde el origen productivo, sin depender de `r2.dev` ni de credenciales de escritura en la aplicación.

### 3. Crear Railway Production

- Crear recursos independientes para `postgres`, `Backend`, `worker` y `Frontend`, junto con el job `database-backup` que define [POSTGRES-BACKUPS.md](../architecture/services/POSTGRES-BACKUPS.md).
- Mantener PostgreSQL y las tareas privadas en la misma región y usar la red privada de Railway entre servicios. La base no tendrá TCP Proxy público para el job de respaldo.
- Aplicar migraciones y verificar `/health`, origen del frontend, proxy a la API, Turnstile, catálogo y enlaces de correo.
- Mantener `CHECKOUT_ENABLED=false`, `ROBOTS_INDEXABLE=false` durante la preparación. No pegar claves Stripe live ni habilitar compras.
- Configurar secretos por servicio y entorno según [RAILWAY.md](../architecture/services/RAILWAY.md). No copiar valores resueltos de Staging a Production.

**Puerta:** el candidato, SHA, migraciones, salud y separación de recursos están identificados; Checkout no puede cobrar y la web no se declara indexable antes de la aceptación.

### 4. Configurar correo productivo

- Verificar el dominio/subdominio remitente de Production en Resend usando registros publicados en la zona autoritativa actual.
- Crear una clave exclusiva y limitarla al Worker. Probar enlaces de cuenta y comprobantes con destinatarios controlados durante una ventana autorizada.
- Verificar remitente, límites, eventos y logs sin exponer dirección, token, cuerpo, adjunto ni clave.

**Puerta:** los recorridos transaccionales llegan a bandejas de control y regresan a la URL de Production; el API no contiene `RESEND_API_KEY`.

### 5. Preparar pagos sin activar ventas

- Crear/confirmar el webhook de Production con su dominio de Backend y eventos exactos, pero mantener Checkout deshabilitado.
- Primero comprobar el flujo con Stripe en modo test y claves test independientes. Una prueba de Staging anterior no acredita el endpoint de Production.
- Las claves live, webhook live, precios comerciales, primer pago real y habilitación de Checkout requieren autorización explícita y revisión final.

**Puerta:** los pagos test llegan al Backend productivo, sólo el webhook firmado confirma pedidos y Stripe no está en modo live antes de la autorización.

### 6. Habilitar y probar respaldos PostgreSQL

Implementar el plan de [pg_dump externo](../architecture/services/POSTGRES-BACKUPS.md) antes de aceptar datos reales. La meta es un dump diario (cada 24 horas) cifrado en un bucket privado de R2, con restauración aislada demostrada. El cron se ejecuta en Railway, pero los archivos se almacenan fuera del producto de respaldos de Railway.

**Puerta:** existe al menos un archivo válido fuera de Railway, alerta de fallo/omisión, restauración de prueba y evidencia de costo estimado, retención y tiempos de recuperación. No confundir cron configurado con recuperación probada.

### 7. Aceptar calidad y preparar salida

Seguir el flujo definido en [QUALITY-AND-RELEASE.md](../quality/QUALITY-AND-RELEASE.md): checks del mismo SHA, recorridos funcionales autorizados, accesibilidad, rendimiento, seguridad pasiva, monitoreo, respaldo y recuperación. No condicionar la aceptación a una revisión visual de correo en iPhone.

Repetir Lighthouse móvil con el dominio final y condiciones comparables. La excepción aceptada en Staging para el LCP no acredita por sí sola el rendimiento de Production: comparar la nueva mediana con el objetivo de 2.5 s y resolver la desviación o solicitar una aceptación expresa para ese entorno antes de la salida.

**Puerta:** no hay hallazgos críticos/altos confirmados sin resolver; hay evidencia del commit y ambiente evaluados, restauración, rollback y aprobación del responsable.

### 8. Abrir al público

Sólo tras aceptar las puertas anteriores y autorizar la salida: habilitar la indexación pública, cambiar los controles SEO, activar Stripe live/Checkout si la autorización comercial lo permite y comunicar el dominio canónico. Conservar fecha, SHA, configuración aprobada y plan de reversión en el registro de salida; resumir en el roadmap el resultado de la fase y los bloqueos importantes.

## Reglas de operación

- Registrar en el roadmap el estado de cada entorno cuando afecte la aceptación o la preparación de Producción. Conservar las fechas de verificación y los SHA detallados en los registros del despliegue; mantener las plantillas de Staging y Production separadas.
- No incluir contraseñas, API keys, secretos de webhook, DSN completos, tokens R2 ni capturas con esos valores.
- Al habilitar Production, resumir en el roadmap el resultado de la salida y conservar la separación del hostname de marca entre los entornos.
