# Instrucciones del repositorio

## Fuentes de verdad

- `README.md`: propósito, arquitectura, políticas del repositorio e instrucciones del entorno local.
- `docs/ROADMAP.md`: resultado principal de cada fase, decisiones relevantes, riesgos críticos y estado de aceptación.
- `docs/architecture/services/`: manuales por proveedor, con procedimientos reproducibles y perfiles por entorno usando marcadores; no son inventarios de configuración desplegada ni bitácoras de prueba/incidentes.
- Las decisiones detalladas de alcance, diseño, contratos de módulos y calidad se añadirán en las fases indicadas por el roadmap. Hasta entonces, el roadmap describe cuándo se prepararán; no supongas que esos documentos o capacidades ya existen.

Mantén cada hecho en su fuente principal. El README describe el producto y sus políticas; los manuales de servicio explican cómo configurar y operar cada proveedor sin fijar valores resueltos de Staging; el roadmap resume los resultados principales, los riesgos que afectan la aceptación y las soluciones de mayor impacto. El roadmap no es una bitácora de herramientas, cambios, commits ni implementaciones. No dupliques el estado de fase en el README ni copies contraseñas, hostnames resueltos, variables actuales o registros de ejecución a los manuales de servicio.

La documentación presenta este repositorio como la fuente definitiva del producto y habla desde la perspectiva de nuestro sistema. Describe arquitectura, comportamiento y decisiones vigentes en presente; usa el pasado sólo cuando una evidencia fechada requiere describir un resultado. Limita el contenido al sistema que define este repositorio; no añadas contexto ni comparaciones de implementaciones ajenas salvo solicitud expresa. Los procedimientos se redactan como pasos reproducibles; la plantilla no acredita que una configuración ya esté desplegada.

## Modos de trabajo y autorizaciones

- El modo predeterminado es supervisado. Antes de hacer commit, push, abrir o actualizar un pull request, fusionar o desplegar, se requiere autorización explícita para esa acción.
- Cada autorización cubre únicamente la acción y el alcance que especifica. Autorizar un commit no autoriza un push, pull request, merge o despliegue posterior.
- El modo no supervisado sólo se activa cuando el usuario delega explícitamente un objetivo y su alcance. Dentro de ese alcance, completa el trabajo necesario sin pedir autorización repetida. La delegación sólo cubre las acciones expresamente incluidas.
- La delegación no autoriza trabajo fuera del alcance, eludir protecciones, exponer secretos, tomar decisiones destructivas o con impacto de presupuesto sin aprobación, ni ignorar aprobaciones de herramientas o políticas.
- Investigar, editar y verificar no autoriza por sí solo publicar o cambiar un sistema externo. Las autorizaciones explícitas anteriores siguen vigentes para las acciones que cubrieron.

## Idioma

- Mantén la documentación del proyecto en español como idioma principal.
- Redacta en inglés los mensajes de commit y los títulos y descripciones de pull request para facilitar la revisión internacional.
- Si se añade una traducción, identifícala claramente y enlázala con la versión en español.

## Conservación de la documentación

- Trata el README, las guías y los contratos aprobados como material del proyecto. Antes de reescribirlos, revisa su contenido e historial.
- Simplificar significa mejorar el orden y eliminar duplicación sin perder instrucciones útiles, decisiones, ejemplos, criterios de cierre ni información necesaria para reproducir el proyecto.
- No elimines, reduzcas drásticamente ni sustituyas una guía, sección sustancial o diagrama sin presentar antes qué contenido se perdería, dónde quedaría y obtener autorización explícita del usuario. Si el usuario ya autorizó ese cambio concreto, no vuelvas a pedirla.
- Conserva las carpetas que agrupan documentación por tema o proveedor. Al mover o renombrar archivos, actualiza y comprueba sus enlaces.
- El README es un documento protegido: no lo reestructures ni reduzcas sin una solicitud explícita. Corrige enlaces rotos sin alterar su contenido sustancial.
- Al actualizar una guía, conserva sus pasos para construir desde cero y distingue ejemplos históricos del estado actual. Contrasta comandos, variables y comportamiento con los archivos y el código vigentes.
- Las guías de servicio deben explicar el propósito, separación por entorno, pasos reproducibles y consideraciones de rendimiento, seguridad y costos. Usa nombres de variables y referencias genéricas; guarda valores resueltos, resultados y correcciones en el roadmap como evidencia resumida, no como una sección de estado dentro del manual.
- Antes de cerrar cambios documentales, compara la versión anterior y la nueva. Informa qué contenido se conservó, trasladó, actualizó o retiró. Verificar enlaces o levantar contenedores no demuestra por sí solo que se haya preservado la información.

## Planificación y estado del roadmap

- Para cada fase nueva o modificada, documenta objetivo, dependencias, resultado esperado y comprobaciones concretas para darla por terminada.
- El roadmap conserva sólo logros principales, decisiones relevantes y estado de aceptación por fase. Incluye errores y soluciones únicamente cuando sean críticos para la seguridad, continuidad, calidad o salida a Producción; resúmelos por impacto, no como secuencia de pasos.
- No uses el roadmap como changelog, bitácora de pruebas o historial de implementaciones. Omite recuentos por herramienta, trazas, inventarios de variables y PR/commits históricos; conserva una referencia de candidato sólo cuando haga falta para entender una aceptación o un bloqueo vigente.
- Si una fase requiere una cuenta, dominio, configuración DNS, credencial o recurso externo, indica quién debe prepararlo y cuándo. Añade ese requisito antes del paso que lo utiliza y señala la guía cuando exista.
- Al actualizar el estado de una fase, distingue si el código está implementado, si el servicio externo está configurado y si el recorrido completo se ha probado. No registres fecha o commit por defecto; identifícalos sólo si hacen falta para resolver una aceptación o un bloqueo vigente. Marca como pendiente lo que no se haya comprobado.
- Conserva de fases anteriores sólo los resultados, dependencias y criterios necesarios para entender el estado actual. Si una decisión posterior los cambia, actualiza la decisión vigente sin convertir el roadmap en un historial de cambios.
- Antes de proponer la siguiente fase, comprueba sus requisitos contra el roadmap, el código y la configuración conocidos. Señala lo que falte o no puedas verificar; no lo presentes como ya disponible.

## Alcance y frontend

- No amplíes el MVP al agregar o cambiar medios en una superficie aprobada; revisa el contrato del módulo cuando exista si cambia una página, flujo o capacidad de usuario.
- Usa Tailwind CSS 4 como opción predeterminada.
- Agrupa los componentes por módulo o responsabilidad. Da una carpeta propia a los componentes compuestos y coloca junto a ellos sus piezas y comportamiento específico. Extrae componentes cuando tengan una responsabilidad clara, comportamiento propio o reutilización; evita crear un archivo o carpeta por cada elemento visual. Ubica las piezas compartidas entre módulos donde su responsabilidad sea evidente, sin duplicarlas. Guarda las pruebas del frontend en `frontend/tests/`.
- Sigue el sistema visual aprobado en la fase 02 (`docs/DESIGN.md`, previsto para esa fase) cuando se incorpore; no inventes ni presentes sus tokens como ya aprobados.
- Usa Lucide React para iconos. Valida en navegador los cambios de interfaz, estados relevantes, accesibilidad, responsividad y consola.
- Antes de implementar una sección de la landing, revisa su estructura, recursos, estilos, interacciones y tamaños definidos. Conserva el comportamiento aprobado y señala ambigüedades antes de cambiarlo.

## Pruebas y ejecución

- Todo entorno local, temporal o de Staging expuesto por HTTP debe impedir la indexación por defecto. En este repositorio, `ROBOTS_INDEXABLE` ausente o `false` mantiene `X-Robots-Tag: noindex, nofollow`; sólo la landing de Production puede permitir indexación con `true` explícito después de aprobar dominio canónico, metadatos, `robots.txt` y `sitemap.xml`. Las rutas de cuenta permanecen en `noindex` en todos los entornos.
- `robots.txt` regula el rastreo y no sustituye `noindex`. No bloquees con `Disallow: /` las páginas cuyo encabezado `noindex` debe leer el buscador. Después de cada despliegue público, comprueba la respuesta HTTP efectiva en todos los hostnames, incluidos los dominios generados por Railway; el nombre del dominio no acredita el entorno ni su política de indexación.

- Define y documenta el CI mínimo al preparar la fase 01. Añade pruebas y build cuando exista código que validar; la validación integral de calidad se definirá en la fase 09.
- Los cambios de lógica o comportamiento incluyen pruebas del contrato afectado y siguen TDD. Los cambios sólo documentales o visuales no requieren pruebas unitarias artificiales.
- Usa `node:test` para el backend y pruebas unitarias del frontend en `frontend/tests/`, salvo que una decisión posterior documente otro esquema.
- Usa Docker Compose como entorno local de referencia una vez que se implemente en la fase 01. Antes de builds, revisa memoria con `free -h` y carga con `docker stats --no-stream`; ejecuta cargas intensivas en serie.
- Usa el nivel de prueba más bajo que dé confianza: unitarias para lógica aislada, integración para límites de API y navegador para recorridos críticos. Las pruebas generadas sólo cuentan si se revisan, versionan y pueden reproducirse.
- Antes de cerrar cambios visuales, revisa en navegador los estados y tamaños afectados, incluida la consola; no declares validaciones que falten.

## Flujo de trabajo

- Al informar el estado del proyecto, revisa los pull requests abiertos y señala cuáles están pendientes o desactualizados. Si no puedes consultar GitHub, indícalo; no cierres ni fusiones un pull request por tu cuenta al hacer esa revisión.
- Mantén los cambios limitados a la solicitud. No agregues Redis ni BullMQ: PostgreSQL persiste los trabajos asíncronos y un worker los procesa.
- Completa la parte de frontend de cada módulo antes de avanzar al siguiente. Mantén una fase del roadmap por chat. Al concluir una fase, crea un chat nuevo en el contexto del proyecto para trabajar en la siguiente y nómbralo según esa fase, salvo indicación explícita del usuario.
