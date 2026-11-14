# Contrato de landing: catálogo y visitas

**Estado:** contrato de implementación de la fase 03, adaptado del repositorio legado. Describe el comportamiento previsto; no acredita que ya esté implementado o configurado en este proyecto. El alcance maestro prevalece en [MVP_SCOPE.md](../MVP_SCOPE.md).

## Presentación y límites de fase

La landing conserva la estructura y el comportamiento del legado: encabezado, hero, escaparate, ritual, preguntas frecuentes, contador y pie de página. El aviso de edad se activa al entrar el escaparate en pantalla y sigue las decisiones de [MVP_SCOPE.md](../MVP_SCOPE.md). Las capacidades de cuenta, carrito y pago pertenecen a fases posteriores; su presencia en el legado no acredita que estén disponibles aquí.

La navegación principal sigue los límites reales de la landing: «Mezcales» y «Promociones» comparten el escaparate (`#coleccion`), y «Nosotros» apunta a las preguntas frecuentes (`#preguntas`). «Nosotros» se activa cuando las FAQ cruzan la línea de referencia y al navegar a `#preguntas`; el ritual describe cómo disfrutar el producto, no la historia de la marca, por lo que no activa ninguna opción. No existe una sección de promociones independiente: al llegar al escaparate mediante scroll, sólo «Mezcales» muestra `aria-current="location"`; «Promociones» se activa al pulsarla y pierde el estado al comenzar un scroll manual o cambiar de ubicación. El hero, el ritual, el contador y el pie no muestran un enlace actual.

El hero se traslada tal como está en el legado, sin rediseño ni optimización en esta fase: imagen original `images/hero-background.png` (1672 × 941), composición adaptable, overlays de oscurecimiento y degradado inferior hacia el escaparate, textos, acción a `#coleccion`, estados de foco y hover y animación de entrada condicionada a la carga de imagen y fuentes. Se conservan los tamaños, puntos de ruptura y tratamiento de movimiento reducido del componente y sus estilos de referencia. La revisión de mejoras es posterior. El escaparate conserva sus fondos de escritorio y móvil, interacciones y transición desde el hero.

Las doce imágenes públicas enumeradas en la [guía de R2](../architecture/services/R2.md) incluyen hero, fondos del escaparate, seis imágenes de producto y ambiente, marca, calavera y etiqueta de agave. Sus rutas se conservan como claves estables. El inventario y el historial Git identifican los archivos y su procedencia técnica en el legado, pero no acreditan autoría ni derechos de uso: queda pendiente que el responsable aporte o confirme esa autorización antes de su publicación. No se sustituyen por iniciativa propia. Las fuentes Cinzel Decorative, Open Sans y Montserrat se distribuyen mediante Fontsource bajo SIL Open Font License 1.1; Lucide React declara licencia ISC, según los archivos de los paquetes instalados.

En desarrollo se sirven medios localmente; el bucket no productivo, su carga y comprobación son tareas externas pendientes del responsable. Se conservan los PNG originales del hero y de los fondos del escaparate; la URL y las variantes efectivamente entregadas, incluido el uso de `getImageProps` en el hero, se comprueban por entorno. No se presupone que R2 transforme imágenes.

## Catálogo público

### Alcance

La landing muestra únicamente productos activos. El catálogo no incluye categorías, páginas de detalle, inventario, administración ni carga de archivos. Los productos y sus referencias de medios se mantienen manualmente en PostgreSQL.

### API

`GET /api/catalog/products` devuelve `200` con `{ "products": [] }` cuando no hay productos activos. Cuando hay productos, cada registro incluye:

```json
{
  "slug": "identificador-estable",
  "name": "Nombre aprobado",
  "description": "Descripción aprobada",
  "price": { "amount": 12345, "currency": "MXN" },
  "image": {
    "url": "https://media.example.test/catalogo/identificador/frente.webp",
    "alt": "Texto alternativo aprobado"
  },
  "lifestyleImage": { "url": "https://media.example.test/catalogo/identificador/ambiente.webp", "alt": "" },
  "labels": ["Materia prima", "Notas de sabor"],
  "sensoryProfile": "Aromas herbales y ahumados.",
  "alcohol": { "minPercent": 40, "maxPercent": 40 },
  "volumeMl": 750
}
```

`price.amount` es un entero en centavos de MXN. `sensoryProfile`, `alcohol` y `volumeMl` pueden ser `null` si esos datos no están documentados; las cifras del ejemplo sólo ilustran la estructura y no representan una ficha comercial. Cuando `alcohol` tiene valor, sus porcentajes describen un valor exacto o un rango mediante `minPercent` y `maxPercent`. La API ordena por `position` y luego `slug`. Si PostgreSQL no está disponible o una ficha activa incumple el contrato, responde `503` con `CATALOG_UNAVAILABLE` y no expone detalles internos.

### Datos y publicación

La tabla `products` conserva un `slug`, nombre, descripción, precio en centavos, claves de ambas imágenes, texto alternativo de la botella, dos etiquetas descriptivas, perfil sensorial, porcentajes mínimo y máximo de alcohol, volumen en mililitros, posición y estado activo. Los campos opcionales de información sensorial, alcohol y volumen pueden quedar sin documentar y se publican como `null`. Los campos requeridos pueden permanecer vacíos mientras la ficha está inactiva; PostgreSQL impide activar un producto incompleto. La imagen de ambiente es decorativa, por lo que su texto alternativo público está vacío.

<code>backend/prisma/dev-showcase.sql</code> carga tres fichas únicamente para una vista previa local. Sus precios de $250, $350 y $500 MXN por 750 ml son los valores correctos del alcance MVP y para las pruebas de desarrollo/staging; no deben confundirse con precios comerciales finales aprobados para producción. El cliente debe confirmar esos precios antes de habilitar ventas reales. El archivo no es una migración ni se ejecuta automáticamente. Sólo úsalo en una base local vacía; no lo apliques en staging o producción. Cuando estén implementados carrito y checkout, estos registros permitirán probar el pago con Stripe en modo de prueba.

### Medios

PostgreSQL conserva una clave relativa y estable, por ejemplo `catalogo/identificador/frente.webp`; no conserva una URL temporal. La aplicación la resuelve con `MEDIA_BASE_URL`. En desarrollo local, Compose apunta al origen del frontend; para revisar desde otro dispositivo de la LAN, puede usar la IP privada del equipo anfitrión por HTTP. Esa excepción sólo está habilitada en desarrollo; para staging, usar HTTPS con el origen público no productivo configurado para medios. No se requieren credenciales de escritura en la aplicación porque la carga del MVP es manual.

Las claves aceptan segmentos ASCII de letras, números, puntos, guiones y guiones bajos, sin segmentos `.` o `..`, barra inicial, query o fragmento. `MEDIA_BASE_URL` requiere HTTPS; localhost y una IPv4 privada por HTTP solo se permiten en desarrollo. Frontend y backend aplican el mismo contrato. La URL no puede contener credenciales, query ni fragmento.

## Contador de visitas

El contador muestra cuántas sesiones del navegador han abierto la landing desde que se habilitó esta tabla. No representa personas únicas ni visitas anteriores a la habilitación del contador.

Al cargar la página, el navegador genera un UUID y lo guarda en `sessionStorage`. Envía `POST /api/visits` a la ruta del frontend; esta lo reenvía a la API interna. Una recarga reutiliza el UUID y no incrementa la cifra. Al abrir otra pestaña o sesión puede generarse otro UUID. No se guardan IP, cookies ni información personal para este contador.

La API expone `GET /api/visits` para leer `{ "count": 123 }` y `POST /api/visits` con `{ "visitId": "UUID v4" }` para registrar la sesión y devolver el conteo actualizado. Ambos responden con `Cache-Control: no-store`. El POST limita el cuerpo a 256 bytes: uno inválido responde 400 (`INVALID_VISIT_ID`) y uno mayor responde 413 (`REQUEST_TOO_LARGE`). Una falla de almacenamiento responde 503 (`VISITS_UNAVAILABLE`). La base de datos impone unicidad sobre `visitId`, de modo que los reintentos son idempotentes.

La cifra se conserva en un registro agregado que se inicializa desde las visitas existentes y se actualiza en la base de datos cuando se inserta una sesión nueva. Leer el contador no recorre la tabla de visitas.

El frontend muestra un guion mientras carga o si el servicio falla; nunca presenta una cifra inventada. Este contador público es orientativo: un cliente puede generar UUID nuevos y sumar visitas. No debe utilizarse como métrica antifraude ni como analítica de usuarios únicos.
