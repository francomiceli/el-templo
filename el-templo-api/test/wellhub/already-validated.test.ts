/**
 * Unit — `isCheckinAlreadyValidated`: distingue el 400 "Check-In already
 * validated" de Wellhub (check-in bueno, ya cuenta para el pago) de un ticket
 * inválido de verdad. Cuerpo copiado de los logs de prod (2026-11-06).
 */

import { describe, it, expect } from "vitest";
import {
  WellhubApiError,
  isCheckinAlreadyValidated,
} from "../../src/modules/wellhub/client";

const PROD_BODY =
  '{"metadata":{"total":0,"errors":1},"errors":[{"message":"Check-In already validated","key":"checkin.already.validated"}]}';

describe("isCheckinAlreadyValidated", () => {
  it("true para el 400 real de Wellhub", () => {
    expect(
      isCheckinAlreadyValidated(new WellhubApiError("x", 400, PROD_BODY)),
    ).toBe(true);
  });

  it("false para otro 400, otro status, cuerpo no JSON o error ajeno", () => {
    expect(
      isCheckinAlreadyValidated(
        new WellhubApiError(
          "x",
          400,
          '{"errors":[{"key":"checkin.not.found"}]}',
        ),
      ),
    ).toBe(false);
    expect(
      isCheckinAlreadyValidated(new WellhubApiError("x", 422, PROD_BODY)),
    ).toBe(false);
    expect(
      isCheckinAlreadyValidated(new WellhubApiError("x", 400, "<html>")),
    ).toBe(false);
    expect(
      isCheckinAlreadyValidated(new WellhubApiError("x", 400, "null")),
    ).toBe(false);
    expect(isCheckinAlreadyValidated(new Error(PROD_BODY))).toBe(false);
    expect(isCheckinAlreadyValidated(undefined)).toBe(false);
  });
});
