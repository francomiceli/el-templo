# Fase 214 — Anuncio previo (D-11)

Estado: ESCRITO, NO PUBLICADO. Lo publica Franco; ningún ejecutor lo envía.

Origen: Borrador 7 del `214-UI-SPEC.md` (sección Copywriting Contract).

## Texto

> **Ahora ves quién va a tu clase.** En Reservas, tocá los anotados de cada horario. Si preferís no aparecer, podés ocultarte desde Perfil.

Texto plano para pegar en Comunicaciones:

```
Ahora ves quién va a tu clase. En Reservas, tocá los anotados de cada horario. Si preferís no aparecer, podés ocultarte desde Perfil.
```

## Cómo se publica

| Dato             | Valor                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canal            | Novedad con push, desde Comunicaciones del admin                                                                                                                                      |
| Destino al tocar | `reservas`                                                                                                                                                                            |
| Quién lo dispara | Franco (no se envía desde la rama ni desde ningún job)                                                                                                                                |
| Cuándo           | ANTES del deploy de las pantallas (D-11 y D-44), para que nadie se entere de la lista por sorpresa. Va después de que el repaso de D-49 dejó los bloques 4 y 6 de la consulta 05 en 0 |
| Opcional         | Sí (no es pantalla ni bloquea el lanzamiento), pero se recomienda: la lista muestra nombre de pila, inicial, foto y Aura a los compañeros                                             |

## Antes de publicarlo

- Confirmar que el destino `reservas` existe en el selector de Comunicaciones del entorno donde se publica.
- Revisar el título de la push: el UI-SPEC solo define el cuerpo. Si Comunicaciones exige título, usar "Reservas" o el que prefiera Franco (decisión suya).
- Publicarlo primero en staging para ver cómo llega a un teléfono de prueba.
