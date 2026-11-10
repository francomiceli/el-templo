-- Fix de dato 2026-11-10: coordenadas de la sede Alberti corridas ~870 m.
--
-- La 0271 cargo latitude/longitude aproximadas (-38.0019, -57.546), que caen en
-- Santa Fe y Belgrano, no en Alberti 2024. Se detecto al medir distancias
-- alumno-sede: el resto de las sedes de MdP coinciden con OpenStreetMap a menos
-- de 6 m y Alberti daba 868 m de diferencia.
--
-- Valor nuevo: Alberti 2024 interpolado entre los numeros 2002 y 2100 de
-- Alberti (lado par) en OpenStreetMap. Precision de algunos metros.
--
-- Guarda: solo pisa el valor aproximado de la 0271. Si alguien ya cargo
-- coordenadas reales (Place ID, admin), no se toca. En una DB sin la sede
-- (tests, otros tenants) es un no-op.
--
-- Reversible: mismo UPDATE con los valores invertidos.

UPDATE branches
  SET latitude = -38.009648, longitude = -57.547185
  WHERE code = 'ALBERTI' AND tenant_id = 1
    AND latitude = -38.001900 AND longitude = -57.546000;
