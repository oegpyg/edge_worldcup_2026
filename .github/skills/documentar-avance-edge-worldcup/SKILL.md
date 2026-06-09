---
name: documentar-avance-edge-worldcup
description: "Usar cuando el usuario pida documentar avance, resumir lo hecho, estado actual, o actualizar for_now.md con progreso tecnico del proyecto Edge World Cup 2026."
---

# Documentar Avance Edge World Cup 2026

## Objetivo

Crear un resumen claro y accionable del estado actual del proyecto, usando como fuente principal la implementacion real del repo y el archivo `for_now.md`.

## Cuando usar esta skill

- El usuario dice: "documentar lo hecho", "actualiza el avance", "dame estado actual", "resume progreso".
- Se necesita alinear una entrega tecnica con una vista ejecutiva.
- Se requiere actualizar `for_now.md` sin perder contexto tecnico importante.

## Entradas a revisar

1. `for_now.md`
2. `README.md`
3. `docker-compose.yml`
4. `apps/api/src/**` (auth, database, mail)
5. `apps/web/app/**`

## Flujo recomendado

1. Leer `for_now.md` para contexto previo.
2. Verificar que el resumen sigue alineado con codigo y arquitectura actual.
3. Reescribir `for_now.md` en formato corto y escaneable.
4. Mantener lenguaje tecnico claro, sin adornos y en ASCII.
5. Cerrar con "proximo bloque sugerido" en 3 pasos maximo.

## Formato de salida sugerido

Usar esta estructura:

1. Titulo con fecha de corte
2. Resumen ejecutivo
3. Lo construido
4. Accesos locales
5. Archivos clave
6. Decisiones tecnicas resueltas
7. Alcance actual
8. Proximo bloque sugerido

## Reglas de calidad

- No inventar features no implementadas.
- No mezclar backlog futuro con estado actual.
- Evitar texto largo; preferir listas cortas.
- Mantener consistencia con puertos y endpoints reales.
