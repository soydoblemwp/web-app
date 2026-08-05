import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateExpression, MAX_EXPRESSION_LENGTH, MAX_FACTORIAL_N } from "@/lib/public-tools/math/expression-parser";
import { formatCalculatorResult, CALCULATOR_DISPLAY_PRECISION } from "@/lib/public-tools/math/numeric-format";

function ok(expr: string, mode: "deg" | "rad" = "rad") {
  const r = evaluateExpression(expr, mode);
  expect(r.ok, r.error).toBe(true);
  return r.value!;
}
function fails(expr: string, mode: "deg" | "rad" = "rad") {
  const r = evaluateExpression(expr, mode);
  expect(r.ok).toBe(false);
  return r.error!;
}

describe("math/expression-parser.ts: safety (spec section 10)", () => {
  it("never uses eval or new Function (source-level check)", () => {
    const source = fs.readFileSync("src/lib/public-tools/math/expression-parser.ts", "utf8");
    expect(source).not.toMatch(/\beval\(/);
    expect(source).not.toMatch(/new Function\(/);
  });

  it("rejects an expression longer than MAX_EXPRESSION_LENGTH", () => {
    const long = "1+".repeat(MAX_EXPRESSION_LENGTH);
    expect(fails(long)).toMatch(/límite/);
  });

  it("rejects unrecognized characters", () => {
    expect(fails("1 & 2")).toBeTruthy();
  });
});

describe("math/expression-parser.ts: precedence and grouping", () => {
  it("respects operator precedence (multiplication before addition)", () => {
    expect(ok("2 + 3 * 4")).toBe(14);
  });
  it("respects parentheses", () => {
    expect(ok("(2 + 3) * 4")).toBe(20);
  });
  it("handles nested parentheses", () => {
    expect(ok("((1 + 2) * (3 + 4))")).toBe(21);
  });
  it("power is right-associative", () => {
    expect(ok("2 ^ 3 ^ 2")).toBe(2 ** (3 ** 2)); // 512, not 64
  });
  it("unary minus works before a parenthesis and a function", () => {
    expect(ok("-(3 + 2)")).toBe(-5);
    expect(ok("-sqrt(16)")).toBe(-4);
  });
  it("supports implicit multiplication (2pi, 2(3+4))", () => {
    expect(ok("2pi")).toBeCloseTo(2 * Math.PI, 10);
    expect(ok("2(3+4)")).toBe(14);
  });
  it("detects unbalanced parentheses", () => {
    expect(fails("(1 + 2")).toBeTruthy();
    expect(fails("1 + 2)")).toBeTruthy();
  });
  it("detects consecutive operators as a real error", () => {
    expect(fails("1 + * 2")).toBeTruthy();
  });
  it("detects a function called with no argument", () => {
    expect(fails("sin()")).toBeTruthy();
  });
});

describe("math/expression-parser.ts: roots and powers", () => {
  it("sqrt of a perfect square", () => {
    expect(ok("sqrt(16)")).toBe(4);
  });
  it("sqrt of a negative number is a real domain error", () => {
    expect(fails("sqrt(-4)")).toMatch(/negativo/);
  });
  it("cbrt of a negative number works (real cube root)", () => {
    expect(ok("cbrt(-27)")).toBeCloseTo(-3, 10);
  });
  it("nth root via root(a,b)", () => {
    expect(ok("root(16,4)")).toBeCloseTo(2, 10);
  });
  it("even-index root of a negative number is a real domain error", () => {
    expect(fails("root(-16,4)")).toMatch(/índice par/);
  });
  it("root with index zero is rejected", () => {
    expect(fails("root(4,0)")).toMatch(/índice de la raíz/);
  });
});

describe("math/expression-parser.ts: factorial", () => {
  it("computes a real factorial", () => {
    expect(ok("5!")).toBe(120);
  });
  it("rejects a negative factorial", () => {
    expect(fails("(-3)!")).toMatch(/factorial/);
  });
  it("rejects a non-integer factorial", () => {
    expect(fails("2.5!")).toMatch(/factorial/);
  });
  it("rejects a factorial beyond MAX_FACTORIAL_N", () => {
    expect(fails(`${MAX_FACTORIAL_N + 1}!`)).toMatch(/demasiado grande/);
  });
});

describe("math/expression-parser.ts: trigonometry (degrees vs radians)", () => {
  it("sin(90) in degree mode is 1", () => {
    expect(ok("sin(90)", "deg")).toBeCloseTo(1, 9);
  });
  it("sin(pi/2) in radian mode is 1", () => {
    expect(ok("sin(pi/2)", "rad")).toBeCloseTo(1, 9);
  });
  it("tan is undefined at 90 degrees (real domain error, not Infinity)", () => {
    expect(fails("tan(90)", "deg")).toMatch(/tangente/);
  });
  it("asin/acos reject values outside [-1, 1]", () => {
    expect(fails("asin(2)")).toMatch(/arcoseno/);
    expect(fails("acos(-2)")).toMatch(/arcocoseno/);
  });
  it("asin returns degrees in degree mode", () => {
    expect(ok("asin(1)", "deg")).toBeCloseTo(90, 9);
  });
});

describe("math/expression-parser.ts: logarithms and exponential", () => {
  it("log10 of a positive number", () => {
    expect(ok("log10(100)")).toBeCloseTo(2, 10);
  });
  it("ln of e is 1", () => {
    expect(ok("ln(e)")).toBeCloseTo(1, 9);
  });
  it("log of zero or a negative number is a real domain error", () => {
    expect(fails("log10(0)")).toMatch(/logaritmo/);
    expect(fails("ln(-1)")).toMatch(/logaritmo/);
  });
  it("exp() works", () => {
    expect(ok("exp(1)")).toBeCloseTo(Math.E, 10);
  });
});

describe("math/expression-parser.ts: constants, percent, abs", () => {
  it("pi and e resolve to real constants", () => {
    expect(ok("pi")).toBeCloseTo(Math.PI, 12);
    expect(ok("e")).toBeCloseTo(Math.E, 12);
  });
  it("percent divides by 100", () => {
    expect(ok("50%")).toBeCloseTo(0.5, 10);
  });
  it("abs works on a negative value", () => {
    expect(ok("abs(-7)")).toBe(7);
  });
});

describe("math/expression-parser.ts: division by zero and overflow", () => {
  it("division by zero is a real, explicit error (never silently Infinity)", () => {
    expect(fails("1/0")).toMatch(/división/i);
  });
  it("an overflowing power is reported as a real error, not silently Infinity", () => {
    expect(fails("10^1000")).toMatch(/finito/);
  });
});

describe("math/numeric-format.ts: display-only formatting", () => {
  it("formats a normal number as-is", () => {
    expect(formatCalculatorResult(42)).toBe("42");
  });
  it("uses scientific notation for very large/small numbers", () => {
    expect(formatCalculatorResult(1e20)).toMatch(/e\+/);
    expect(formatCalculatorResult(1e-15)).toMatch(/e-/);
  });
  it("shows a documented, finite display precision (never claims unlimited precision)", () => {
    expect(CALCULATOR_DISPLAY_PRECISION).toBeGreaterThan(0);
    expect(CALCULATOR_DISPLAY_PRECISION).toBeLessThan(20);
  });
  it("never returns NaN/Infinity as a raw JS string", () => {
    expect(formatCalculatorResult(NaN)).toBe("Error");
    expect(formatCalculatorResult(Infinity)).toBe("∞");
  });
});
