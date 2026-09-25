// Tiny evaluator for the Python subset used in GRC block YAML templates,
// e.g. "${ 'part' if vlen == 1 else 'none' }" or "${ type.size }".
//
// Supports: literals, list/tuple literals, names, attribute access, calls (int/str/float/bool/len/sum,
// .startswith/.endswith), not/and/or, comparisons (incl. in / not in), + - * /, and
// "a if cond else b". Anything else throws Unresolved, so callers can fall back.

export class Unresolved extends Error {}

const TOKEN_RE =
  /\s*(?:(\d+\.\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|\d+(?:[eE][-+]?\d+)?)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|([A-Za-z_]\w*)|(==|!=|<=|>=|[()[\]<>.,+\-*/]))/y;

function tokenize(src) {
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  while (TOKEN_RE.lastIndex < src.length) {
    if (/^\s*$/.test(src.slice(TOKEN_RE.lastIndex))) break;
    const m = TOKEN_RE.exec(src);
    if (!m) throw new Unresolved(`bad token in: ${src}`);
    if (m[1] !== undefined) tokens.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ t: "str", v: m[2].slice(1, -1) });
    else if (m[3] !== undefined) tokens.push({ t: "name", v: m[3] });
    else tokens.push({ t: "op", v: m[4] });
  }
  return tokens;
}

function parse(src) {
  const tokens = tokenize(src);
  let i = 0;
  const peek = () => tokens[i];
  const isOp = (v) => peek() && (peek().t === "op" || peek().t === "name") && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new Unresolved(`expected ${v} in: ${src}`);
    i++;
  };

  function ternary() {
    const body = or();
    if (isOp("if")) {
      i++;
      const cond = or();
      expect("else");
      return { k: "if", cond, body, orelse: ternary() };
    }
    return body;
  }
  function or() {
    let l = and();
    while (isOp("or")) { i++; l = { k: "or", l, r: and() }; }
    return l;
  }
  function and() {
    let l = not();
    while (isOp("and")) { i++; l = { k: "and", l, r: not() }; }
    return l;
  }
  function not() {
    if (isOp("not")) { i++; return { k: "not", e: not() }; }
    return cmp();
  }
  function cmp() {
    let l = add();
    for (;;) {
      let op;
      if (["==", "!=", "<", ">", "<=", ">=", "in"].some(isOp)) op = tokens[i++].v;
      else if (isOp("not") && tokens[i + 1]?.v === "in") { i += 2; op = "not in"; }
      else return l;
      l = { k: "bin", op, l, r: add() };
    }
  }
  function add() {
    let l = mul();
    while (isOp("+") || isOp("-")) { const op = tokens[i++].v; l = { k: "bin", op, l, r: mul() }; }
    return l;
  }
  function mul() {
    let l = unary();
    while (isOp("*") || isOp("/")) { const op = tokens[i++].v; l = { k: "bin", op, l, r: unary() }; }
    return l;
  }
  function unary() {
    if (isOp("-")) { i++; return { k: "neg", e: unary() }; }
    return postfix();
  }
  function postfix() {
    let e = primary();
    for (;;) {
      if (isOp(".")) {
        i++;
        const tok = tokens[i++];
        if (!tok || tok.t !== "name") throw new Unresolved(`bad attribute in: ${src}`);
        e = { k: "attr", e, name: tok.v };
      } else if (isOp("(")) {
        i++;
        const args = [];
        while (!isOp(")")) {
          args.push(ternary());
          if (!isOp(")")) expect(",");
        }
        i++;
        e = { k: "call", fn: e, args };
      } else return e;
    }
  }
  function primary() {
    const tok = tokens[i++];
    if (!tok) throw new Unresolved(`unexpected end of: ${src}`);
    if (tok.t === "num" || tok.t === "str") return { k: "lit", v: tok.v };
    if (tok.t === "name") {
      if (tok.v === "True") return { k: "lit", v: true };
      if (tok.v === "False") return { k: "lit", v: false };
      if (tok.v === "None") return { k: "lit", v: null };
      return { k: "name", v: tok.v };
    }
    if (tok.v === "(" || tok.v === "[") {
      const close = tok.v === "(" ? ")" : "]";
      const items = [];
      let sawComma = false;
      while (!isOp(close)) {
        items.push(ternary());
        if (!isOp(close)) { expect(","); sawComma = true; }
      }
      i++;
      if (tok.v === "(" && items.length === 1 && !sawComma) return items[0];
      return { k: "list", items };
    }
    throw new Unresolved(`unexpected ${tok.v} in: ${src}`);
  }

  const ast = ternary();
  if (i !== tokens.length) throw new Unresolved(`trailing tokens in: ${src}`);
  return ast;
}

// Python-ish conversions for raw parameter strings
export function coerce(raw) {
  if (typeof raw !== "string") return raw;
  const s = raw.trim();
  if (s === "True") return true;
  if (s === "False") return false;
  if (s !== "" && !isNaN(Number(s))) return Number(s);
  return s;
}

const truthy = (v) => !(v === false || v === 0 || v === "" || v === null || v === undefined);

function pyStr(v) {
  if (v === true) return "True";
  if (v === false) return "False";
  if (v === null) return "None";
  return String(v);
}

const BUILTINS = {
  int: (v) => { const n = Math.trunc(Number(v)); if (isNaN(n)) throw new Unresolved("int()"); return n; },
  float: (v) => { const n = Number(v); if (isNaN(n)) throw new Unresolved("float()"); return n; },
  str: pyStr,
  bool: truthy,
  sum: (v) => { if (!Array.isArray(v)) throw new Unresolved("sum()"); return v.reduce((a, b) => a + Number(b), 0); },
  len: (v) => { if (typeof v === "string" || Array.isArray(v)) return v.length; throw new Unresolved("len()"); },
};

// scope.lookup(name) -> value, or an object { value, attr(name) } for enum params
function evaluate(node, scope) {
  const val = (n) => {
    const v = evaluate(n, scope);
    return v && typeof v === "object" && "value" in v ? v.value : v;
  };
  switch (node.k) {
    case "lit": return node.v;
    case "list": return node.items.map(val);
    case "name": {
      if (node.v in BUILTINS) return BUILTINS[node.v];
      return scope.lookup(node.v);
    }
    case "attr": {
      const obj = evaluate(node.e, scope);
      if (obj && typeof obj === "object" && typeof obj.attr === "function") return obj.attr(node.name);
      const s = typeof obj === "object" && obj !== null ? obj.value : obj;
      if (typeof s === "string" && (node.name === "startswith" || node.name === "endswith")) {
        return (arg) => (node.name === "startswith" ? s.startsWith(arg) : s.endsWith(arg));
      }
      throw new Unresolved(`attribute ${node.name}`);
    }
    case "call": {
      const fn = evaluate(node.fn, scope);
      if (typeof fn !== "function") throw new Unresolved("not callable");
      return fn(...node.args.map(val));
    }
    case "not": return !truthy(val(node.e));
    case "and": { const l = val(node.l); return truthy(l) ? val(node.r) : l; }
    case "or": { const l = val(node.l); return truthy(l) ? l : val(node.r); }
    case "if": return truthy(val(node.cond)) ? val(node.body) : val(node.orelse);
    case "neg": return -val(node.e);
    case "bin": {
      const l = val(node.l), r = val(node.r);
      switch (node.op) {
        case "==": return l === r;
        case "!=": return l !== r;
        case "<": return l < r;
        case ">": return l > r;
        case "<=": return l <= r;
        case ">=": return l >= r;
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return l / r;
        case "in":
        case "not in": {
          if (!Array.isArray(r) && typeof r !== "string") throw new Unresolved("in");
          const found = r.includes(l);
          return node.op === "in" ? found : !found;
        }
      }
    }
  }
  throw new Unresolved(`unsupported node ${node.k}`);
}

const astCache = new Map();

// Evaluate a template value. Plain values are returned as-is; "${ expr }"
// is evaluated. Throws Unresolved when the expression can't be handled.
export function evalTemplate(template, scope) {
  if (typeof template !== "string") return template;
  const m = template.match(/^\s*\$\{([\s\S]*)\}\s*$/);
  if (!m) {
    if (template.includes("${")) throw new Unresolved(`mixed template: ${template}`);
    return template;
  }
  let ast = astCache.get(m[1]);
  if (!ast) {
    ast = parse(m[1]);
    astCache.set(m[1], ast);
  }
  const v = evaluate(ast, scope);
  return v && typeof v === "object" && "value" in v ? v.value : v;
}
