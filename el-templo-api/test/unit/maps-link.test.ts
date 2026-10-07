import { describe, expect, it } from "vitest";
import {
  isGoogleMapsUrl,
  isShortMapsUrl,
  parseMapsLink,
  precisionOk,
} from "../../src/modules/web-public/maps-link";

/** Fase 195-14 (D-08): parser puro de links de Google Maps. Sin red. */
const LARGO =
  "https://www.google.com/maps/place/X/@-38.0335,-57.5522,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-38.0334512!4d-57.5521989";

describe("parseMapsLink", () => {
  it("link largo: prioriza !3d/!4d (el punto del lugar) sobre @ (el centro de la vista)", () => {
    expect(parseMapsLink(LARGO)).toEqual({
      lat: -38.0334512,
      lng: -57.5521989,
      placeId: null,
    });
  });

  it("sin !3d/!4d usa el @ del centro", () => {
    expect(
      parseMapsLink(
        "https://www.google.com/maps/place/X/@-38.0335,-57.5522,17z",
      ),
    ).toEqual({ lat: -38.0335, lng: -57.5522, placeId: null });
  });

  it("maps.google.com con q=<lat>,<lng>", () => {
    expect(
      parseMapsLink("https://maps.google.com/?q=-38.03345,-57.55219"),
    ).toEqual({
      lat: -38.03345,
      lng: -57.55219,
      placeId: null,
    });
  });

  it("query= y ll= numéricos, con espacios alrededor de la coma", () => {
    expect(
      parseMapsLink(
        "https://www.google.com/maps/search/?api=1&query=41.3996%2C%202.1709",
      ),
    ).toEqual({ lat: 41.3996, lng: 2.1709, placeId: null });
    expect(parseMapsLink("https://maps.google.com/?ll=41.3996,2.1709")).toEqual(
      {
        lat: 41.3996,
        lng: 2.1709,
        placeId: null,
      },
    );
  });

  it("coordenadas pegadas en la ruta de /maps/place/", () => {
    expect(
      parseMapsLink("https://www.google.com/maps/place/-38.03345,-57.55219"),
    ).toEqual({ lat: -38.03345, lng: -57.55219, placeId: null });
  });

  it("query_place_id sin coordenadas: devuelve solo el Place ID", () => {
    expect(
      parseMapsLink(
        "https://www.google.com/maps/search/?api=1&query=Juan+B+Justo+1018&query_place_id=ChIJabc123",
      ),
    ).toEqual({ lat: null, lng: null, placeId: "ChIJabc123" });
  });

  it("place_id: dentro de q= y place_id= como parámetro", () => {
    expect(
      parseMapsLink(
        "https://www.google.com/maps/search/?api=1&query=place_id:ChIJabc123",
      ),
    ).toEqual({ lat: null, lng: null, placeId: "ChIJabc123" });
    expect(
      parseMapsLink("https://maps.google.com/?place_id=ChIJabc123"),
    ).toEqual({
      lat: null,
      lng: null,
      placeId: "ChIJabc123",
    });
  });

  it("coordenadas y Place ID juntos", () => {
    expect(
      parseMapsLink(
        "https://www.google.com/maps/search/?api=1&query=-38.03345,-57.55219&query_place_id=ChIJabc123",
      ),
    ).toEqual({ lat: -38.03345, lng: -57.55219, placeId: "ChIJabc123" });
  });

  it("un host que no es de Google Maps devuelve null aunque traiga coordenadas", () => {
    expect(parseMapsLink("https://example.com/foo")).toBeNull();
    expect(
      parseMapsLink("https://example.com/maps/place/@-38.03345,-57.55219,17z"),
    ).toBeNull();
    expect(
      parseMapsLink(
        "https://www.google.com.evil.com/maps/place/@-38.03345,-57.55219,17z",
      ),
    ).toBeNull();
    expect(
      parseMapsLink("https://maps.google.com.evil.com/?q=-38.03345,-57.55219"),
    ).toBeNull();
  });

  it("google.com fuera de /maps, http plano y texto que no es URL devuelven null", () => {
    expect(
      parseMapsLink("https://www.google.com/search?q=-38.03345,-57.55219"),
    ).toBeNull();
    expect(
      parseMapsLink("https://www.google.com/mapsfoo/@-38.03345,-57.55219,17z"),
    ).toBeNull();
    expect(
      parseMapsLink("http://maps.google.com/?q=-38.03345,-57.55219"),
    ).toBeNull();
    expect(parseMapsLink("no es un link")).toBeNull();
    expect(parseMapsLink("")).toBeNull();
  });

  it("un link corto no es un link largo: devuelve null", () => {
    expect(parseMapsLink("https://maps.app.goo.gl/abc123")).toBeNull();
  });

  it("coordenadas fuera de rango devuelven null", () => {
    expect(
      parseMapsLink("https://maps.google.com/?q=120.5,-57.55219"),
    ).toBeNull();
    expect(
      parseMapsLink("https://maps.google.com/?q=-38.03345,190.5"),
    ).toBeNull();
    expect(
      parseMapsLink(
        "https://www.google.com/maps/place/X/data=!3d95.5!4d-57.55219",
      ),
    ).toBeNull();
  });

  it("un grado por encima del borde del rango devuelve null", () => {
    expect(
      parseMapsLink("https://maps.google.com/?q=90.5,-57.55219"),
    ).toBeNull();
    expect(
      parseMapsLink("https://maps.google.com/?q=-90.5,-57.55219"),
    ).toBeNull();
    expect(
      parseMapsLink("https://maps.google.com/?q=-38.03345,180.5"),
    ).toBeNull();
    expect(
      parseMapsLink("https://maps.google.com/?q=-38.03345,-180.5"),
    ).toBeNull();
  });

  it("los bordes exactos del rango se aceptan", () => {
    expect(parseMapsLink("https://maps.google.com/?q=90,180")).toEqual({
      lat: 90,
      lng: 180,
      placeId: null,
    });
    expect(parseMapsLink("https://maps.google.com/?q=-90,-180")).toEqual({
      lat: -90,
      lng: -180,
      placeId: null,
    });
  });

  it("0,0 (relleno de Google) devuelve null", () => {
    expect(parseMapsLink("https://maps.google.com/?q=0,0")).toBeNull();
  });

  it("una coordenada fuera de rango no se reemplaza por una de menor prioridad", () => {
    expect(
      parseMapsLink(
        "https://www.google.com/maps/place/X/@-38.0335,-57.5522,17z/data=!3d120.5!4d-57.55219",
      ),
    ).toBeNull();
  });

  it("un Place ID con caracteres raros se descarta", () => {
    expect(
      parseMapsLink(
        "https://maps.google.com/?q=-38.03345,-57.55219&query_place_id=Ch%27%3Bdrop",
      ),
    ).toEqual({ lat: -38.03345, lng: -57.55219, placeId: null });
  });

  it("un link de Google Maps sin coordenadas ni Place ID devuelve null", () => {
    expect(
      parseMapsLink(
        "https://www.google.com/maps/search/?api=1&query=Juan+B+Justo",
      ),
    ).toBeNull();
  });

  it("recorta espacios alrededor del link", () => {
    expect(parseMapsLink(`  ${LARGO}  `)?.lat).toBe(-38.0334512);
  });
});

describe("isGoogleMapsUrl / isShortMapsUrl", () => {
  const u = (s: string) => new URL(s);
  it("aceptan solo los hosts de la lista cerrada", () => {
    expect(isGoogleMapsUrl(u("https://www.google.com/maps/place/x"))).toBe(
      true,
    );
    expect(isGoogleMapsUrl(u("https://google.com/maps?q=1,2"))).toBe(true);
    expect(isGoogleMapsUrl(u("https://maps.google.com/"))).toBe(true);
    expect(isGoogleMapsUrl(u("https://www.google.com/"))).toBe(false);
    expect(isGoogleMapsUrl(u("https://maps.app.goo.gl/abc"))).toBe(false);
    expect(isGoogleMapsUrl(u("https://consent.google.com/maps/x"))).toBe(false);
    expect(isGoogleMapsUrl(u("https://www.google.com.ar/maps/x"))).toBe(false);
    expect(isShortMapsUrl(u("https://maps.app.goo.gl/abc"))).toBe(true);
    expect(isShortMapsUrl(u("https://goo.gl/maps/abc"))).toBe(true);
    expect(isShortMapsUrl(u("https://goo.gl/otro/abc"))).toBe(false);
    expect(isShortMapsUrl(u("https://maps.app.goo.gl.evil.com/abc"))).toBe(
      false,
    );
    expect(isShortMapsUrl(u("http://maps.app.goo.gl/abc"))).toBe(false);
  });
});

describe("precisionOk", () => {
  it("4 decimales no alcanza, 5 sí", () => {
    expect(precisionOk(-38.0335)).toBe(false);
    expect(precisionOk(-38.03345)).toBe(true);
  });
  it("más de 5 decimales y valores enteros", () => {
    expect(precisionOk(-57.5521989)).toBe(true);
    expect(precisionOk(2.170912)).toBe(true);
    expect(precisionOk(41)).toBe(false);
    expect(precisionOk(0)).toBe(false);
  });
  it("no finitos son falsos", () => {
    expect(precisionOk(Number.NaN)).toBe(false);
    expect(precisionOk(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
