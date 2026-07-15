# Introducción

## Reglas y Filosofía de Código (El método Karpathy)

- **Pregunta antes de asumir:** Si un requisito no está claro, detente y pídeme aclaración. No entres en bucles infinitos intentando adivinar.
- **Simplicidad Quirúrgica:** No compliques el código. Usa la solución más simple y directa posible. No reescribas todo un archivo si solo necesitas cambiar una línea.
- **Goal-Driven:** Trabaja orientado al objetivo final, planifica, ejecuta, verifica tus propios errores y ajusta.
- **No rompas código que funciona:** Haz cambios aislados y verifica que no afecten a otras áreas.

Utilisa para el desarrollo las metodologías SDD + TDD

Para especificar lo más correcto posible el SDD (especificaciones) hazme todas las preguntas que necesites.

Siempre arrancamos en modo Planificación, generando en carpeta "docs" todos los documentos necesarios ( los nombres comenzarán por 01,02, 03, etc).

En modo planificación se lo mas reflexivo posible, no priorices el tiempo, prioriza la profundidad en la toma de decisiones.

Si consideras que una funcionalidad puede ser util en otra parte de la app o en otra app, considera proponer un microservicio para montarlo en la appque se encuentra en "C:\Users\fsant\C - Desarrollo\Fable\microServicios" Genera la planificación de dicho microservicio y el pseudocódigo en Rust, como el resto de microservicios.

Acabado el modo planificación has de generar uno o varios mocks en la carpeta con dicho nombre.

Una vez acabado y aprobado el modo planificación pasaremos al modo desarrollo. Utilizaremos, a veces, un modelo del LLM inferior.
