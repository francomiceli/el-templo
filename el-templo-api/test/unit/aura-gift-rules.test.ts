/**
 * Unit tests de las reglas puras del regalo de Aura (fase 215).
 *
 * Todo es puro, sin DB: ventana (D-12), semana del tope (D-05), motivos (D-16),
 * montos (D-10, D-11) y porcentaje de la medición (D-21).
 */

import { describe, it, expect } from "vitest";
import {
  COACH_GIFT_AMOUNT,
  GIFT_REASONS,
  GIFT_REFERENCE,
  GIFT_ROUTE,
  GIFT_VOID_LABEL,
  giftVoidLabel,
  GIFT_WEEKLY_CAP,
  giftExpiresOn,
  giftMovementLabel,
  giftPersonName,
  giftPushText,
  isAnonymousGiver,
  giftReasonLabel,
  giftWeekRange,
  giversPct,
  isGiftReason,
  isValidCoachGiftAmount,
  isWithinGiftWindow,
} from "../../src/modules/aura/gift-rules";

describe("motivos del regalo (D-16)", () => {
  it("son exactamente 4, en este orden y con su texto", () => {
    expect(GIFT_REASONS).toEqual([
      { code: "tecnica", label: "Buena técnica" },
      { code: "constancia", label: "Constancia" },
      { code: "energia", label: "Buena energía" },
      { code: "ayudo", label: "Me ayudó" },
    ]);
  });

  it("isGiftReason acepta solo los 4 códigos", () => {
    expect(isGiftReason("energia")).toBe(true);
    expect(isGiftReason("tecnica")).toBe(true);
    expect(isGiftReason("otro")).toBe(false);
    expect(isGiftReason("")).toBe(false);
    expect(isGiftReason(null)).toBe(false);
    expect(isGiftReason(3)).toBe(false);
  });

  it("giftReasonLabel devuelve el texto del motivo", () => {
    expect(giftReasonLabel("ayudo")).toBe("Me ayudó");
    expect(giftReasonLabel("tecnica")).toBe("Buena técnica");
  });
});

describe("ventana para regalar (D-12)", () => {
  it("el mismo día y el día anterior valen", () => {
    expect(isWithinGiftWindow("2026-11-17", "2026-11-17")).toBe(true);
    expect(isWithinGiftWindow("2026-11-16", "2026-11-17")).toBe(true);
  });

  it("antes de ayer no vale", () => {
    expect(isWithinGiftWindow("2026-11-15", "2026-11-17")).toBe(false);
  });

  it("una fecha futura no vale", () => {
    expect(isWithinGiftWindow("2026-11-18", "2026-11-17")).toBe(false);
  });

  it("cruza el fin de mes y el de año", () => {
    expect(isWithinGiftWindow("2026-10-31", "2026-11-01")).toBe(true);
    expect(isWithinGiftWindow("2026-12-31", "2027-01-01")).toBe(true);
    expect(isWithinGiftWindow("2026-10-30", "2026-11-01")).toBe(false);
  });

  it("giftExpiresOn es el día siguiente a la clase", () => {
    expect(giftExpiresOn("2026-11-30")).toBe("2026-12-01");
    expect(giftExpiresOn("2026-12-31")).toBe("2027-01-01");
  });
});

describe("semana del tope (D-05)", () => {
  it("un miércoles cae en la semana de lunes a domingo", () => {
    expect(giftWeekRange("2026-11-18")).toEqual({
      start: "2026-11-16",
      end: "2026-11-22",
    });
  });

  it("el lunes y el domingo dan la misma semana", () => {
    const monday = giftWeekRange("2026-11-16");
    const sunday = giftWeekRange("2026-11-22");
    expect(monday).toEqual(sunday);
    expect(monday).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  });

  it("el lunes siguiente abre otra semana", () => {
    expect(giftWeekRange("2026-11-23")).toEqual({
      start: "2026-11-23",
      end: "2026-11-29",
    });
  });

  it("el tope es 2 por persona y semana", () => {
    expect(GIFT_WEEKLY_CAP).toBe(2);
  });
});

describe("valor del regalo del profe (D-11)", () => {
  it("arranca en 2 y va de 1 a 10", () => {
    expect(COACH_GIFT_AMOUNT).toEqual({ default: 2, min: 1, max: 10 });
  });

  it("acepta solo enteros del 1 al 10", () => {
    expect(isValidCoachGiftAmount(1)).toBe(true);
    expect(isValidCoachGiftAmount(2)).toBe(true);
    expect(isValidCoachGiftAmount(10)).toBe(true);
    expect(isValidCoachGiftAmount(0)).toBe(false);
    expect(isValidCoachGiftAmount(11)).toBe(false);
    expect(isValidCoachGiftAmount(-1)).toBe(false);
    expect(isValidCoachGiftAmount(2.5)).toBe(false);
    expect(isValidCoachGiftAmount(NaN)).toBe(false);
    expect(isValidCoachGiftAmount(Infinity)).toBe(false);
  });

  it("rechaza lo que no es número", () => {
    expect(isValidCoachGiftAmount("2")).toBe(false);
    expect(isValidCoachGiftAmount(null)).toBe(false);
    expect(isValidCoachGiftAmount(undefined)).toBe(false);
  });
});

describe("referencias del ledger", () => {
  it("el regalo y su anulación tienen su referencia", () => {
    expect(GIFT_REFERENCE).toEqual({
      gift: "aura_gift",
      void: "aura_gift_void",
    });
  });
});

describe("porcentaje de quienes regalaron (D-21)", () => {
  it("redondea al entero más cercano", () => {
    expect(giversPct(3, 12)).toBe(25);
    expect(giversPct(1, 3)).toBe(33);
    expect(giversPct(2, 3)).toBe(67);
  });

  it("sin base da 0", () => {
    expect(giversPct(0, 0)).toBe(0);
    expect(giversPct(5, 0)).toBe(0);
  });
});

describe("textos del regalo (D-19, D-22)", () => {
  const alumno = {
    giverKind: "alumno",
    giverFirstName: "Sofía",
    giverLastInitial: "M",
    reason: "energia",
  } as const;
  const profe = {
    giverKind: "profe",
    giverFirstName: "Fran",
    giverLastInitial: null,
    reason: "tecnica",
  } as const;

  it("giftPersonName arma nombre e inicial", () => {
    expect(giftPersonName("Sofía", "M")).toBe("Sofía M.");
    expect(giftPersonName("Sofía", null)).toBe("Sofía");
    expect(giftPersonName("", null)).toBe("Alguien");
    expect(giftPersonName("  Sofía  ", "  M ")).toBe("Sofía M.");
    expect(giftPersonName(null, "M")).toBe("Alguien");
    expect(giftPersonName("Sofía", "")).toBe("Sofía");
  });

  it("push de un alumno dice quién dio y el motivo", () => {
    expect(giftPushText(alumno)).toEqual({
      title: "Sofía M. te dio Aura",
      body: "Motivo: Buena energía.",
    });
  });

  it("push del profe va solo con el nombre de pila", () => {
    expect(giftPushText(profe)).toEqual({
      title: "Tu profe Fran te dio Aura",
      body: "Motivo: Buena técnica.",
    });
    expect(
      giftPushText({ ...profe, giverFirstName: "Fran", giverLastInitial: "G" })
        .title,
    ).toBe("Tu profe Fran te dio Aura");
  });

  it("ME-01 y #38: sin nombre u oculto, la push no nombra a nadie ni dice Alguien", () => {
    const sinNombre = {
      ...alumno,
      giverFirstName: null,
      giverLastInitial: null,
    };
    expect(giftPushText(sinNombre)).toEqual({
      title: "Te dieron 1 de Aura",
      body: "Motivo: Buena energía.",
    });
    expect(giftPushText({ ...sinNombre, giverFirstName: "  " }).title).toBe(
      "Te dieron 1 de Aura",
    );
    expect(giftPushText({ ...alumno, giverHidden: true, amount: 2 })).toEqual({
      title: "Te dieron 2 de Aura",
      body: "Motivo: Buena energía.",
    });
    expect(giftPushText(sinNombre).title).not.toContain("Alguien");
  });

  it("el profe sin nombre sigue siendo Tu profe", () => {
    expect(giftPushText({ ...profe, giverFirstName: null }).title).toBe(
      "Tu profe te dio Aura",
    );
    expect(isAnonymousGiver({ ...profe, giverFirstName: null })).toBe(false);
    expect(isAnonymousGiver({ ...profe, giverHidden: true })).toBe(false);
  });

  it("isAnonymousGiver: cuatro cruces del alumno", () => {
    expect(isAnonymousGiver(alumno)).toBe(false);
    expect(isAnonymousGiver({ ...alumno, giverHidden: false })).toBe(false);
    expect(isAnonymousGiver({ ...alumno, giverHidden: true })).toBe(true);
    expect(isAnonymousGiver({ ...alumno, giverFirstName: "" })).toBe(true);
    expect(isAnonymousGiver({ ...alumno, giverFirstName: null })).toBe(true);
  });

  it("detalle del movimiento", () => {
    expect(giftMovementLabel(alumno)).toBe(
      "Sofía M. te dio Aura · Buena energía",
    );
    expect(giftMovementLabel(profe)).toBe(
      "Tu profe Fran te dio Aura · Buena técnica",
    );
  });

  it("regalo que ya no se encuentra y regalo anulado", () => {
    expect(giftMovementLabel(null)).toBe("Regalo de Aura");
    expect(GIFT_VOID_LABEL).toBe("Regalo anulado");
  });

  it("regalo anulado con causa (#28, #37)", () => {
    expect(giftVoidLabel("asistencia")).toBe(
      "Regalo anulado: la asistencia se corrigió",
    );
    expect(giftVoidLabel("staff")).toBe("Regalo anulado por el staff");
    expect(giftVoidLabel(null)).toBe("Regalo anulado");
    expect(giftVoidLabel(undefined)).toBe("Regalo anulado");
  });

  it("el destino es el detalle de Aura", () => {
    expect(GIFT_ROUTE).toBe("/mi-templo?aura=detalle");
  });

  it("ningún texto promete privacidad", () => {
    const texts: string[] = [
      GIFT_VOID_LABEL,
      giftVoidLabel("asistencia"),
      giftVoidLabel("staff"),
      giftMovementLabel(null),
    ];
    for (const input of [
      alumno,
      profe,
      { ...alumno, giverHidden: true },
      { ...alumno, giverFirstName: null },
    ]) {
      const push = giftPushText(input);
      texts.push(push.title, push.body, giftMovementLabel(input));
    }
    for (const reason of GIFT_REASONS) {
      texts.push(
        giftMovementLabel({ ...alumno, reason: reason.code }),
        giftPushText({ ...profe, reason: reason.code }).body,
      );
    }
    for (const text of texts) {
      expect(text.toLowerCase()).not.toContain("privad");
    }
  });
});
