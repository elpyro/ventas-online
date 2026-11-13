import { describe, it, expect } from "vitest";
import { cartKey } from "./types";

describe("cartKey", () => {
  it("sin variante usa solo el SKU", () => {
    expect(cartKey("A5511-9-10")).toBe("A5511-9-10");
  });

  it("con variante usa SKU::variantId", () => {
    expect(cartKey("FUN-IP13", "negro-m")).toBe("FUN-IP13::negro-m");
  });

  it("variantId vacío se trata como sin variante", () => {
    expect(cartKey("SKU", "")).toBe("SKU");
  });
});
