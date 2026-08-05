/**
 * A hand-written tokenizer + recursive-descent parser + AST evaluator for
 * the scientific calculator — never `eval`/`new Function` (spec section 10:
 * "no conviertas la expresión en JavaScript"). Every arithmetic/function
 * result is validated for finiteness and documented domain errors are
 * raised as `ExpressionError` rather than silently producing `NaN`/`Infinity`.
 */

export const MAX_EXPRESSION_LENGTH = 500;
export const MAX_FACTORIAL_N = 170; // 171! overflows a real double

export type AngleMode = "deg" | "rad";

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

type TokenType = "number" | "ident" | "op" | "lparen" | "rparen" | "comma" | "bang" | "percent";
interface Token {
  type: TokenType;
  value: string;
}

const IDENT_RE = /[a-zA-Z_][a-zA-Z0-9_]*/y;
const NUMBER_RE = /\d+(\.\d+)?([eE][+-]?\d+)?/y;

function tokenize(input: string): Token[] {
  if (input.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionError(`La expresión supera el límite de ${MAX_EXPRESSION_LENGTH} caracteres.`);
  }
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen", value: ch });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", value: ch });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma", value: ch });
      i++;
      continue;
    }
    if (ch === "!") {
      tokens.push({ type: "bang", value: ch });
      i++;
      continue;
    }
    if (ch === "%") {
      tokens.push({ type: "percent", value: ch });
      i++;
      continue;
    }
    if ("+-*/^".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    NUMBER_RE.lastIndex = i;
    const numMatch = NUMBER_RE.exec(input);
    if (numMatch && numMatch.index === i) {
      tokens.push({ type: "number", value: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }
    IDENT_RE.lastIndex = i;
    const identMatch = IDENT_RE.exec(input);
    if (identMatch && identMatch.index === i) {
      tokens.push({ type: "ident", value: identMatch[0] });
      i += identMatch[0].length;
      continue;
    }
    throw new ExpressionError(`Carácter no reconocido: "${ch}".`);
  }
  return tokens;
}

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const UNARY_FUNCTIONS = new Set(["sqrt", "cbrt", "abs", "sin", "cos", "tan", "asin", "acos", "atan", "log10", "ln", "exp"]);
const BINARY_FUNCTIONS = new Set(["root", "nthroot"]);

// AST node types — a plain discriminated union, never compiled to JS source.
type Node =
  | { kind: "num"; value: number }
  | { kind: "const"; name: string }
  | { kind: "unaryMinus"; arg: Node }
  | { kind: "binOp"; op: "+" | "-" | "*" | "/" | "^"; left: Node; right: Node }
  | { kind: "factorial"; arg: Node }
  | { kind: "percent"; arg: Node }
  | { kind: "unaryFn"; name: string; arg: Node }
  | { kind: "binaryFn"; name: string; a: Node; b: Node };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new ExpressionError("La expresión termina de forma inesperada.");
    this.pos++;
    return t;
  }
  private expect(type: TokenType): Token {
    const t = this.peek();
    if (!t || t.type !== type) throw new ExpressionError(`Se esperaba "${type}" en la posición ${this.pos}.`);
    return this.next();
  }

  parseProgram(): Node {
    if (this.tokens.length === 0) throw new ExpressionError("La expresión está vacía.");
    const node = this.parseExpression();
    if (this.pos !== this.tokens.length) throw new ExpressionError("Caracteres sobrantes al final de la expresión.");
    return node;
  }

  private parseExpression(): Node {
    let left = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
        this.next();
        const right = this.parseTerm();
        left = { kind: "binOp", op: t.value as "+" | "-", left, right };
      } else break;
    }
    return left;
  }

  private parseTerm(): Node {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t && t.type === "op" && (t.value === "*" || t.value === "/")) {
        this.next();
        const right = this.parseUnary();
        left = { kind: "binOp", op: t.value as "*" | "/", left, right };
      } else if (t && (t.type === "number" || t.type === "lparen" || t.type === "ident")) {
        // Implicit multiplication, e.g. "2pi" or "2(3+4)" or "2sin(1)".
        const right = this.parseUnary();
        left = { kind: "binOp", op: "*", left, right };
      } else break;
    }
    return left;
  }

  private parseUnary(): Node {
    const t = this.peek();
    if (t && t.type === "op" && t.value === "-") {
      this.next();
      return { kind: "unaryMinus", arg: this.parseUnary() };
    }
    if (t && t.type === "op" && t.value === "+") {
      this.next();
      return this.parseUnary();
    }
    return this.parsePower();
  }

  private parsePower(): Node {
    const base = this.parsePostfix();
    const t = this.peek();
    if (t && t.type === "op" && t.value === "^") {
      this.next();
      const exponent = this.parseUnary(); // right-associative
      return { kind: "binOp", op: "^", left: base, right: exponent };
    }
    return base;
  }

  private parsePostfix(): Node {
    let node = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t && t.type === "bang") {
        this.next();
        node = { kind: "factorial", arg: node };
      } else if (t && t.type === "percent") {
        this.next();
        node = { kind: "percent", arg: node };
      } else break;
    }
    return node;
  }

  private parsePrimary(): Node {
    const t = this.peek();
    if (!t) throw new ExpressionError("Se esperaba un valor y la expresión terminó.");

    if (t.type === "number") {
      this.next();
      return { kind: "num", value: Number(t.value) };
    }
    if (t.type === "lparen") {
      this.next();
      const inner = this.parseExpression();
      this.expect("rparen");
      return inner;
    }
    if (t.type === "ident") {
      this.next();
      const name = t.value.toLowerCase();
      if (this.peek()?.type === "lparen") {
        this.next();
        const first = this.parseExpression();
        if (this.peek()?.type === "comma") {
          this.next();
          const second = this.parseExpression();
          this.expect("rparen");
          if (!BINARY_FUNCTIONS.has(name)) throw new ExpressionError(`"${name}" no acepta dos argumentos.`);
          return { kind: "binaryFn", name, a: first, b: second };
        }
        this.expect("rparen");
        if (!UNARY_FUNCTIONS.has(name)) throw new ExpressionError(`Función desconocida: "${name}".`);
        return { kind: "unaryFn", name, arg: first };
      }
      if (name in CONSTANTS) return { kind: "const", name };
      throw new ExpressionError(`Identificador desconocido: "${name}". Las funciones requieren paréntesis, p. ej. sin(30).`);
    }
    throw new ExpressionError("Token inesperado en la expresión (paréntesis o función sin argumento).");
  }
}

function assertFinite(value: number, context: string): number {
  if (!Number.isFinite(value)) {
    throw new ExpressionError(`El resultado de ${context} no es un número finito (posible división por cero o desbordamiento).`);
  }
  return value;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new ExpressionError("El factorial solo está definido para enteros no negativos.");
  if (n > MAX_FACTORIAL_N) throw new ExpressionError(`El factorial es demasiado grande (máximo ${MAX_FACTORIAL_N}!).`);
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return assertFinite(result, "el factorial");
}

function evaluateNode(node: Node, mode: AngleMode): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "const":
      return CONSTANTS[node.name];
    case "unaryMinus":
      return -evaluateNode(node.arg, mode);
    case "percent":
      return evaluateNode(node.arg, mode) / 100;
    case "factorial":
      return factorial(evaluateNode(node.arg, mode));
    case "binOp": {
      const l = evaluateNode(node.left, mode);
      const r = evaluateNode(node.right, mode);
      switch (node.op) {
        case "+":
          return assertFinite(l + r, "la suma");
        case "-":
          return assertFinite(l - r, "la resta");
        case "*":
          return assertFinite(l * r, "la multiplicación");
        case "/":
          if (r === 0) throw new ExpressionError("División por cero.");
          return assertFinite(l / r, "la división");
        case "^":
          return assertFinite(Math.pow(l, r), "la potencia");
      }
      break;
    }
    case "unaryFn": {
      const x = evaluateNode(node.arg, mode);
      return assertFinite(evalUnaryFn(node.name, x, mode), `${node.name}(...)`);
    }
    case "binaryFn": {
      const a = evaluateNode(node.a, mode);
      const b = evaluateNode(node.b, mode);
      if (b === 0) throw new ExpressionError("El índice de la raíz no puede ser cero.");
      if (a < 0 && b % 2 === 0) throw new ExpressionError("No existe una raíz de índice par de un número negativo (resultado real).");
      const magnitude = Math.pow(Math.abs(a), 1 / b);
      return assertFinite(a < 0 ? -magnitude : magnitude, "la raíz");
    }
  }
  throw new ExpressionError("Nodo de expresión no reconocido.");
}

function toRadians(x: number, mode: AngleMode): number {
  return mode === "deg" ? (x * Math.PI) / 180 : x;
}
function fromRadians(x: number, mode: AngleMode): number {
  return mode === "deg" ? (x * 180) / Math.PI : x;
}

function evalUnaryFn(name: string, x: number, mode: AngleMode): number {
  switch (name) {
    case "sqrt":
      if (x < 0) throw new ExpressionError("La raíz cuadrada de un número negativo no es real.");
      return Math.sqrt(x);
    case "cbrt":
      return Math.cbrt(x);
    case "abs":
      return Math.abs(x);
    case "sin":
      return Math.sin(toRadians(x, mode));
    case "cos":
      return Math.cos(toRadians(x, mode));
    case "tan": {
      const rad = toRadians(x, mode);
      const cos = Math.cos(rad);
      if (Math.abs(cos) < 1e-12) throw new ExpressionError("La tangente no está definida en este ángulo (90°, 270°...).");
      return Math.tan(rad);
    }
    case "asin":
      if (x < -1 || x > 1) throw new ExpressionError("arcoseno solo está definido entre -1 y 1.");
      return fromRadians(Math.asin(x), mode);
    case "acos":
      if (x < -1 || x > 1) throw new ExpressionError("arcocoseno solo está definido entre -1 y 1.");
      return fromRadians(Math.acos(x), mode);
    case "atan":
      return fromRadians(Math.atan(x), mode);
    case "log10":
      if (x <= 0) throw new ExpressionError("El logaritmo solo está definido para números mayores que cero.");
      return Math.log10(x);
    case "ln":
      if (x <= 0) throw new ExpressionError("El logaritmo natural solo está definido para números mayores que cero.");
      return Math.log(x);
    case "exp":
      return Math.exp(x);
  }
  throw new ExpressionError(`Función desconocida: "${name}".`);
}

export interface EvaluateResult {
  ok: boolean;
  value?: number;
  error?: string;
}

/** The single entry point every UI/tests call — tokenizes, parses, and evaluates without ever touching `eval`/`new Function`. */
export function evaluateExpression(expression: string, mode: AngleMode = "rad"): EvaluateResult {
  try {
    const tokens = tokenize(expression);
    const ast = new Parser(tokens).parseProgram();
    const value = evaluateNode(ast, mode);
    return { ok: true, value };
  } catch (err) {
    if (err instanceof ExpressionError) return { ok: false, error: err.message };
    return { ok: false, error: "Error inesperado al evaluar la expresión." };
  }
}
