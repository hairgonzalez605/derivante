// Derivante — shared symbolic differentiation engine
// Loaded by both "Calculadora de derivadas.html" and "Graficas.html".
// Plain global functions (no IIFE wrapper) so both pages' inline scripts can call them directly.

  // ---------- KaTeX rendering ----------
  function renderMath(container) {
    if (!window.renderMathInElement) return;
    renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  }

  // ======================================================================
  // SYMBOLIC DIFFERENTIATION ENGINE
  // ======================================================================
  class CalcError extends Error {}

  const FUNC_NAMES = ['asin','acos','atan','sinh','cosh','tanh','sin','cos','tan','cot','sec','csc','ln','log','sqrt','exp','abs'];
  const CONST_NAMES = ['pi', 'e'];
  const KNOWN_WORDS = [...FUNC_NAMES, ...CONST_NAMES].sort((a, b) => b.length - a.length);
  const ORDINALS = { 1: 'Primer orden', 2: 'Segundo orden', 3: 'Tercer orden', 4: 'Cuarto orden' };

  // ---------- Tokenizer ----------
  function tokenize(input) {
    const src = input.replace(/\s+/g, '');
    if (!src) throw new CalcError('Escribe una función antes de calcular.');
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < src.length && /[0-9.]/.test(src[j])) j++;
        const numStr = src.slice(i, j);
        if (!/^\d*\.?\d+$/.test(numStr)) throw new CalcError(`Número no válido: "${numStr}".`);
        tokens.push({ type: 'num', value: parseFloat(numStr) });
        i = j;
        continue;
      }
      if (/[a-zA-Z]/.test(c)) {
        let j = i;
        while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
        let word = src.slice(i, j);
        i = j;
        while (word.length) {
          const known = KNOWN_WORDS.find(k => word.startsWith(k));
          if (known) {
            tokens.push({ type: FUNC_NAMES.includes(known) ? 'func' : 'const', value: known });
            word = word.slice(known.length);
          } else {
            tokens.push({ type: 'var', value: word[0] });
            word = word.slice(1);
          }
        }
        continue;
      }
      if ('+-*/^'.includes(c)) { tokens.push({ type: 'op', value: c }); i++; continue; }
      if (c === '(' || c === ')') { tokens.push({ type: 'paren', value: c }); i++; continue; }
      if (c === ',') { tokens.push({ type: 'comma', value: ',' }); i++; continue; }
      if (c === '=') { tokens.push({ type: 'eq', value: '=' }); i++; continue; }
      throw new CalcError(`Carácter no reconocido: "${c}".`);
    }
    return tokens;
  }

  function insertImplicitMultiplication(tokens) {
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      out.push(t);
      const next = tokens[i + 1];
      if (!next) continue;
      const curEndsValue = ['num', 'var', 'const'].includes(t.type) || (t.type === 'paren' && t.value === ')');
      const nextStartsValue = ['num', 'var', 'const', 'func'].includes(next.type) || (next.type === 'paren' && next.value === '(');
      if (curEndsValue && nextStartsValue) out.push({ type: 'op', value: '*' });
    }
    return out;
  }

  // ---------- Parser (recursive descent) ----------
  function parse(tokens) {
    let pos = 0;
    const peek = () => tokens[pos];
    const eat = (type, value) => {
      const t = tokens[pos];
      if (!t || t.type !== type || (value !== undefined && t.value !== value)) {
        throw new CalcError(t ? `Se esperaba "${value ?? type}" pero se encontró "${t.value}".` : 'La expresión termina antes de tiempo — revisa los paréntesis.');
      }
      pos++;
      return t;
    };

    function parseExpr() {
      let node = parseTerm();
      while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        const op = eat('op').value;
        node = { type: op === '+' ? 'add' : 'sub', a: node, b: parseTerm() };
      }
      return node;
    }
    function parseTerm() {
      let node = parseUnary();
      while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
        const op = eat('op').value;
        node = { type: op === '*' ? 'mul' : 'div', a: node, b: parseUnary() };
      }
      return node;
    }
    function parseUnary() {
      if (peek() && peek().type === 'op' && peek().value === '-') { eat('op'); return { type: 'neg', a: parseUnary() }; }
      if (peek() && peek().type === 'op' && peek().value === '+') { eat('op'); return parseUnary(); }
      return parsePow();
    }
    function parsePow() {
      const base = parsePrimary();
      if (peek() && peek().type === 'op' && peek().value === '^') {
        eat('op');
        return { type: 'pow', a: base, b: parseUnary() };
      }
      return base;
    }
    function parsePrimary() {
      const t = peek();
      if (!t) throw new CalcError('La expresión termina antes de tiempo — revisa los paréntesis.');
      if (t.type === 'num') { eat('num'); return { type: 'num', value: t.value }; }
      if (t.type === 'const') { eat('const'); return { type: 'const', name: t.value }; }
      if (t.type === 'var') { eat('var'); return { type: 'var', name: t.value }; }
      if (t.type === 'func') {
        eat('func');
        let arg;
        if (peek() && peek().type === 'paren' && peek().value === '(') {
          eat('paren', '('); arg = parseExpr(); eat('paren', ')');
        } else {
          arg = parseUnary();
        }
        return { type: 'func', name: t.value, arg };
      }
      if (t.type === 'paren' && t.value === '(') {
        eat('paren', '('); const node = parseExpr(); eat('paren', ')');
        return node;
      }
      throw new CalcError(`Símbolo inesperado: "${t.value}".`);
    }

    const left = parseExpr();
    if (peek() && peek().type === 'eq') {
      eat('eq');
      const right = parseExpr();
      if (pos < tokens.length) throw new CalcError(`Símbolo inesperado: "${peek().value}".`);
      return { isEquation: true, left, right };
    }
    if (pos < tokens.length) throw new CalcError(`Símbolo inesperado: "${peek().value}".`);
    return { isEquation: false, node: left };
  }

  // ---------- AST helpers ----------
  function containsVar(node, v) {
    switch (node.type) {
      case 'num': case 'const': return false;
      case 'var': return node.name === v;
      case 'neg': return containsVar(node.a, v);
      case 'func': return containsVar(node.arg, v);
      default: return containsVar(node.a, v) || containsVar(node.b, v);
    }
  }
  function substitute(node, name, replacement) {
    switch (node.type) {
      case 'num': case 'const': return node;
      case 'var': return node.name === name ? replacement : node;
      case 'neg': return { type: 'neg', a: substitute(node.a, name, replacement) };
      case 'func': return { type: 'func', name: node.name, arg: substitute(node.arg, name, replacement) };
      default: return { type: node.type, a: substitute(node.a, name, replacement), b: substitute(node.b, name, replacement) };
    }
  }
  function collectAdditiveTerms(node, sign, terms) {
    if (node.type === 'add') { collectAdditiveTerms(node.a, sign, terms); collectAdditiveTerms(node.b, sign, terms); return; }
    if (node.type === 'sub') { collectAdditiveTerms(node.a, sign, terms); collectAdditiveTerms(node.b, -sign, terms); return; }
    if (node.type === 'neg') { collectAdditiveTerms(node.a, -sign, terms); return; }
    terms.push({ sign, node });
  }
  function sumSignedTerms(list) {
    let acc = null;
    for (const t of list) {
      if (acc === null) acc = t.sign === 1 ? t.node : { type: 'neg', a: t.node };
      else acc = t.sign === 1 ? { type: 'add', a: acc, b: t.node } : { type: 'sub', a: acc, b: t.node };
    }
    return acc || { type: 'num', value: 0 };
  }
  // E is a sum/difference of terms, each containing __yp__ at most once (linear by construction
  // of the chain rule). Splitting into yp-terms vs. yp-free terms avoids relying on the simplifier
  // to cancel compound subtraction patterns like "(2x+2y)-(2x)", which it can't do in general.
  function extractYpCoefficient(E, ypName) {
    const terms = [];
    collectAdditiveTerms(E, 1, terms);
    const coeffTerms = [], constTerms = [];
    for (const t of terms) {
      if (containsVar(t.node, ypName)) coeffTerms.push({ sign: t.sign, node: fullSimplify(substitute(t.node, ypName, { type: 'num', value: 1 })) });
      else constTerms.push(t);
    }
    return { coeff: fullSimplify(sumSignedTerms(coeffTerms)), constPart: fullSimplify(sumSignedTerms(constTerms)) };
  }
  function countNodes(node) {
    if (['num', 'const', 'var'].includes(node.type)) return 1;
    if (node.type === 'neg') return 1 + countNodes(node.a);
    if (node.type === 'func') return 1 + countNodes(node.arg);
    return 1 + countNodes(node.a) + countNodes(node.b);
  }
  function hasNodeMatching(node, pred) {
    if (pred(node)) return true;
    if (node.type === 'neg') return hasNodeMatching(node.a, pred);
    if (node.type === 'func') return hasNodeMatching(node.arg, pred);
    if (node.a) return hasNodeMatching(node.a, pred) || hasNodeMatching(node.b, pred);
    return false;
  }
  function computeDomainNote(node, xVar) {
    const risky = hasNodeMatching(node, n =>
      (n.type === 'func' && ['ln', 'log', 'sqrt', 'tan', 'sec', 'cot', 'csc', 'asin', 'acos'].includes(n.name)) ||
      n.type === 'div'
    );
    return risky ? 'Definida donde la expresión sea válida.' : `$${xVar} \\in \\mathbb{R}$`;
  }

  // ---------- Indeterminate / undefined result detection ----------
  // Thrown instead of CalcError when a sub-expression is a fixed numeric value
  // (no variable involved) that is mathematically indeterminate (e.g. 0/0, 0^0)
  // or simply undefined in the reals (e.g. division by zero, log of a
  // non-positive number, sqrt of a negative number). Carries `issue` so the
  // caller can show a dedicated pop-up instead of the generic error banner.
  class IndeterminateError extends CalcError {
    constructor(issue) { super(issue.message); this.issue = issue; }
  }
  function containsAnyVar(node) {
    switch (node.type) {
      case 'num': case 'const': return false;
      case 'var': return true;
      case 'neg': return containsAnyVar(node.a);
      case 'func': return containsAnyVar(node.arg);
      default: return containsAnyVar(node.a) || containsAnyVar(node.b);
    }
  }
  // Plain numeric evaluator for sub-trees already known to be variable-free
  // (checked via containsAnyVar by the caller). Never called on a 'var' node.
  function evalConstNode(node) {
    switch (node.type) {
      case 'num': return node.value;
      case 'const': return node.name === 'pi' ? Math.PI : Math.E;
      case 'neg': return -evalConstNode(node.a);
      case 'add': return evalConstNode(node.a) + evalConstNode(node.b);
      case 'sub': return evalConstNode(node.a) - evalConstNode(node.b);
      case 'mul': return evalConstNode(node.a) * evalConstNode(node.b);
      case 'div': return evalConstNode(node.a) / evalConstNode(node.b);
      case 'pow': return Math.pow(evalConstNode(node.a), evalConstNode(node.b));
      case 'func': {
        const v = evalConstNode(node.arg);
        switch (node.name) {
          case 'sin': return Math.sin(v);
          case 'cos': return Math.cos(v);
          case 'tan': return Math.tan(v);
          case 'cot': return 1 / Math.tan(v);
          case 'sec': return 1 / Math.cos(v);
          case 'csc': return 1 / Math.sin(v);
          case 'asin': return Math.asin(v);
          case 'acos': return Math.acos(v);
          case 'atan': return Math.atan(v);
          case 'sinh': return Math.sinh(v);
          case 'cosh': return Math.cosh(v);
          case 'tanh': return Math.tanh(v);
          case 'ln': return Math.log(v);
          case 'log': return Math.log10(v);
          case 'sqrt': return Math.sqrt(v);
          case 'exp': return Math.exp(v);
          case 'abs': return Math.abs(v);
          default: return NaN;
        }
      }
      default: return NaN;
    }
  }
  // Walks the tree looking for a sub-expression that is a fixed numeric value
  // (contains no variable) and is either one of the seven classic indeterminate
  // forms (0/0, 0^0 — the only two reachable through literal input, since this
  // calculator has no way to type infinity) or simply undefined in the reals
  // (division by zero, log/sqrt/inverse-trig outside their domain). Post-order:
  // children are checked before their parent, so the deepest, most specific
  // offending sub-expression is reported first.
  function findIndeterminateIssue(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.a) { const r = findIndeterminateIssue(node.a); if (r) return r; }
    if (node.b) { const r = findIndeterminateIssue(node.b); if (r) return r; }
    if (node.arg) { const r = findIndeterminateIssue(node.arg); if (r) return r; }

    if (node.type === 'div' && !containsAnyVar(node.b)) {
      const bVal = evalConstNode(node.b);
      if (bVal === 0) {
        if (!containsAnyVar(node.a)) {
          const aVal = evalConstNode(node.a);
          if (aVal === 0) {
            return { kind: 'indeterminate', formLatex: '\\dfrac{0}{0}',
              message: `La expresión contiene una división de la forma $\\dfrac{0}{0}$ (numerador y denominador se reducen ambos a cero). Es una de las siete formas indeterminadas clásicas del cálculo: no tiene un valor único definido sin un análisis adicional, como factorización, la regla de L'Hôpital o un límite.` };
          }
          return { kind: 'undefined', formLatex: `\\dfrac{${fmtNum(aVal)}}{0}`,
            message: `La expresión contiene una división entre cero (el denominador se reduce a $0$), lo cual no está definido en los números reales.` };
        }
        return { kind: 'undefined', formLatex: `\\dfrac{\\cdot}{0}`,
          message: `El denominador de una de las divisiones en la expresión se reduce a $0$ para todo valor de la variable, así que esa división no está definida en ningún punto del dominio.` };
      }
    }
    if (node.type === 'pow' && !containsAnyVar(node.a) && !containsAnyVar(node.b)) {
      const aVal = evalConstNode(node.a), bVal = evalConstNode(node.b);
      if (aVal === 0 && bVal === 0) {
        return { kind: 'indeterminate', formLatex: '0^{0}',
          message: `La expresión contiene la potencia $0^{0}$. Es una de las siete formas indeterminadas clásicas del cálculo: su valor no queda determinado únicamente por la estructura de la expresión.` };
      }
      if (aVal === 0 && bVal < 0) {
        return { kind: 'undefined', formLatex: `0^{${fmtNum(bVal)}}`,
          message: `La expresión eleva $0$ a un exponente negativo ($0^{${fmtNum(bVal)}}$), lo cual equivale a dividir entre cero y no está definido.` };
      }
    }
    if (node.type === 'func' && !containsAnyVar(node.arg)) {
      const v = evalConstNode(node.arg);
      if ((node.name === 'ln' || node.name === 'log') && v <= 0) {
        return { kind: 'undefined', formLatex: `\\${node.name}(${fmtNum(v)})`,
          message: `El logaritmo no está definido para valores menores o iguales a cero, y el argumento de ${node.name === 'ln' ? '$\\ln$' : '$\\log$'} se reduce a $${fmtNum(v)}$.` };
      }
      if (node.name === 'sqrt' && v < 0) {
        return { kind: 'undefined', formLatex: `\\sqrt{${fmtNum(v)}}`,
          message: `La raíz cuadrada no está definida para números negativos dentro de los números reales, y el argumento se reduce a $${fmtNum(v)}$.` };
      }
      if ((node.name === 'asin' || node.name === 'acos') && (v < -1 || v > 1)) {
        return { kind: 'undefined', formLatex: `\\${node.name === 'asin' ? 'arcsin' : 'arccos'}(${fmtNum(v)})`,
          message: `${node.name === 'asin' ? 'El arcoseno' : 'El arcocoseno'} solo está definido para valores entre $-1$ y $1$, y el argumento se reduce a $${fmtNum(v)}$.` };
      }
    }
    return null;
  }

  // ---------- Differentiation ----------
  function diff(node, xVar, steps, yVar) {
    const log = (title, before, after, detail) => {
      if (!steps) return;
      const simplifiedAfter = fullSimplify(after);
      const polyTerms = extractPolyTerms(before, xVar);
      const isSimpleEnoughForLimit = polyTerms && polyTerms.length === 1 && polyTerms[0].degree <= 4;
      const limitProof = isSimpleEnoughForLimit ? tryLimitDerivation(before, xVar, simplifiedAfter) : null;
      steps.push({
        title,
        current: `\\frac{d}{d${xVar}}\\left[${toLatex(before)}\\right]`,
        math: toLatex(simplifiedAfter),
        note: detail,
        limitProof,
      });
    };
    switch (node.type) {
      case 'num': case 'const': return { type: 'num', value: 0 };
      case 'var':
        if (node.name === xVar) return { type: 'num', value: 1 };
        if (yVar && node.name === yVar) return { type: 'var', name: '__yp__' };
        return { type: 'num', value: 0 };
      case 'neg':
        return { type: 'neg', a: diff(node.a, xVar, steps, yVar) };
      case 'add': {
        const da = diff(node.a, xVar, steps, yVar);
        const db = diff(node.b, xVar, steps, yVar);
        const result = { type: 'add', a: da, b: db };
        log('Regla de la suma', node, result,
          `La expresión es una suma de dos términos, ${mathInline(toLatex(node.a))} y ${mathInline(toLatex(node.b))}. ` +
          `La derivada de una suma es la suma de las derivadas de cada término por separado, así que basta con derivar cada uno y sumar los resultados. ` +
          `La derivada de ${mathInline(toLatex(node.a))} es ${mathInline(simplifiedLatex(da))}, y la derivada de ${mathInline(toLatex(node.b))} es ${mathInline(simplifiedLatex(db))}.`);
        return result;
      }
      case 'sub': {
        const da = diff(node.a, xVar, steps, yVar);
        const db = diff(node.b, xVar, steps, yVar);
        const result = { type: 'sub', a: da, b: db };
        log('Regla de la resta', node, result,
          `La expresión es una resta de dos términos, ${mathInline(toLatex(node.a))} y ${mathInline(toLatex(node.b))}. ` +
          `La derivada de una resta es la resta de las derivadas de cada término, en el mismo orden, así que se deriva cada uno por separado y se restan los resultados. ` +
          `La derivada de ${mathInline(toLatex(node.a))} es ${mathInline(simplifiedLatex(da))}, y la derivada de ${mathInline(toLatex(node.b))} es ${mathInline(simplifiedLatex(db))}.`);
        return result;
      }
      case 'mul': {
        const aConst = !containsVar(node.a, xVar) && !(yVar && containsVar(node.a, yVar));
        const bConst = !containsVar(node.b, xVar) && !(yVar && containsVar(node.b, yVar));
        if (aConst) {
          const db = diff(node.b, xVar, steps, yVar);
          const result = { type: 'mul', a: node.a, b: db };
          log('Factor constante', node, result, `El factor ${mathInline(toLatex(node.a))} es constante: se conserva y solo se deriva ${mathInline(toLatex(node.b))}.`);
          return result;
        }
        if (bConst) {
          const da = diff(node.a, xVar, steps, yVar);
          const result = { type: 'mul', a: node.b, b: da };
          log('Factor constante', node, result, `El factor ${mathInline(toLatex(node.b))} es constante: se conserva y solo se deriva ${mathInline(toLatex(node.a))}.`);
          return result;
        }
        const da = diff(node.a, xVar, steps, yVar);
        const db = diff(node.b, xVar, steps, yVar);
        const result = { type: 'add', a: { type: 'mul', a: da, b: node.b }, b: { type: 'mul', a: node.a, b: db } };
        log('Regla del producto', node, result,
          `Es un producto de dos funciones, ${mathInline(toLatex(node.a))} y ${mathInline(toLatex(node.b))}. ` +
          `La derivada de ${mathInline(toLatex(node.a))} es ${mathInline(simplifiedLatex(da))}, y la derivada de ${mathInline(toLatex(node.b))} es ${mathInline(simplifiedLatex(db))}. ` +
          `Se multiplica cada derivada por la otra función y se suman los resultados.`);
        return result;
      }
      case 'div': {
        const bConst = !containsVar(node.b, xVar) && !(yVar && containsVar(node.b, yVar));
        if (bConst) {
          const da = diff(node.a, xVar, steps, yVar);
          const result = { type: 'div', a: da, b: node.b };
          log('División entre una constante', node, result, `El divisor ${mathInline(toLatex(node.b))} es constante: se deriva solo ${mathInline(toLatex(node.a))} y se divide el resultado entre ${mathInline(toLatex(node.b))}.`);
          return result;
        }
        const da = diff(node.a, xVar, steps, yVar);
        const db = diff(node.b, xVar, steps, yVar);
        const numerator = { type: 'sub', a: { type: 'mul', a: da, b: node.b }, b: { type: 'mul', a: node.a, b: db } };
        const result = { type: 'div', a: numerator, b: { type: 'pow', a: node.b, b: { type: 'num', value: 2 } } };
        log('Regla del cociente', node, result,
          `Es un cociente entre ${mathInline(toLatex(node.a))} y ${mathInline(toLatex(node.b))}. ` +
          `La derivada de ${mathInline(toLatex(node.a))} es ${mathInline(simplifiedLatex(da))}, y la derivada de ${mathInline(toLatex(node.b))} es ${mathInline(simplifiedLatex(db))}. ` +
          `Se combinan como (derivada del numerador × denominador − numerador × derivada del denominador), todo entre el denominador al cuadrado.`);
        return result;
      }
      case 'pow': {
        const baseHasVar = containsVar(node.a, xVar) || (yVar && containsVar(node.a, yVar));
        const expHasVar = containsVar(node.b, xVar) || (yVar && containsVar(node.b, yVar));
        if (!expHasVar) {
          const da = diff(node.a, xVar, steps, yVar);
          const powered = { type: 'pow', a: node.a, b: { type: 'sub', a: node.b, b: { type: 'num', value: 1 } } };
          const result = { type: 'mul', a: { type: 'mul', a: node.b, b: powered }, b: da };
          if (baseHasVar) {
            const chainNote = (node.a.type === 'var' && node.a.name === xVar)
              ? ''
              : ` Como la base ${mathInline(toLatex(node.a))} no es simplemente ${xVar}, se multiplica además por su derivada, ${mathInline(simplifiedLatex(da))} (regla de la cadena).`;
            log('Regla de la potencia', node, result,
              `El exponente ${mathInline(toLatex(node.b))} baja a multiplicar al frente, y el nuevo exponente se reduce en uno: ${mathInline(toLatex(powered))}.${chainNote}`);
          }
          return result;
        }
        if (!baseHasVar) {
          const du = diff(node.b, xVar, steps, yVar);
          const result = { type: 'mul', a: { type: 'mul', a: node, b: { type: 'func', name: 'ln', arg: node.a } }, b: du };
          log('Regla exponencial', node, result,
            `La base ${mathInline(toLatex(node.a))} es constante y el exponente ${mathInline(toLatex(node.b))} depende de ${xVar}. ` +
            `La derivada es la propia potencia multiplicada por ${mathInline('\\ln(' + toLatex(node.a) + ')')}, y por la derivada del exponente, ${mathInline(simplifiedLatex(du))}.`);
          return result;
        }
        const du = diff(node.a, xVar, steps, yVar);
        const dv = diff(node.b, xVar, steps, yVar);
        const inner = { type: 'add', a: { type: 'mul', a: dv, b: { type: 'func', name: 'ln', arg: node.a } }, b: { type: 'mul', a: node.b, b: { type: 'div', a: du, b: node.a } } };
        const result = { type: 'mul', a: node, b: inner };
        log('Derivación logarítmica', node, result,
          `Tanto la base ${mathInline(toLatex(node.a))} como el exponente ${mathInline(toLatex(node.b))} dependen de ${xVar}, así que se deriva tomando logaritmos de ambos lados.`);
        return result;
      }
      case 'func':
        return diffFunc(node, xVar, steps, yVar, log);
    }
  }

  function diffFunc(node, xVar, steps, yVar, log) {
    const u = node.arg;
    const du = diff(u, xVar, steps, yVar);
    const chainNeeded = !(u.type === 'var' && u.name === xVar);
    let outerDeriv;
    switch (node.name) {
      case 'sin': outerDeriv = { type: 'func', name: 'cos', arg: u }; break;
      case 'cos': outerDeriv = { type: 'neg', a: { type: 'func', name: 'sin', arg: u } }; break;
      case 'tan': outerDeriv = { type: 'div', a: { type: 'num', value: 1 }, b: { type: 'pow', a: { type: 'func', name: 'cos', arg: u }, b: { type: 'num', value: 2 } } }; break;
      case 'cot': outerDeriv = { type: 'neg', a: { type: 'div', a: { type: 'num', value: 1 }, b: { type: 'pow', a: { type: 'func', name: 'sin', arg: u }, b: { type: 'num', value: 2 } } } }; break;
      case 'sec': outerDeriv = { type: 'mul', a: { type: 'func', name: 'sec', arg: u }, b: { type: 'func', name: 'tan', arg: u } }; break;
      case 'csc': outerDeriv = { type: 'neg', a: { type: 'mul', a: { type: 'func', name: 'csc', arg: u }, b: { type: 'func', name: 'cot', arg: u } } }; break;
      case 'ln': outerDeriv = { type: 'div', a: { type: 'num', value: 1 }, b: u }; break;
      case 'log': outerDeriv = { type: 'div', a: { type: 'num', value: 1 }, b: { type: 'mul', a: u, b: { type: 'func', name: 'ln', arg: { type: 'num', value: 10 } } } }; break;
      case 'exp': outerDeriv = { type: 'func', name: 'exp', arg: u }; break;
      case 'sqrt': outerDeriv = { type: 'div', a: { type: 'num', value: 1 }, b: { type: 'mul', a: { type: 'num', value: 2 }, b: { type: 'func', name: 'sqrt', arg: u } } }; break;
      case 'asin': outerDeriv = { type: 'div', a: { type: 'num', value: 1 }, b: { type: 'func', name: 'sqrt', arg: { type: 'sub', a: { type: 'num', value: 1 }, b: { type: 'pow', a: u, b: { type: 'num', value: 2 } } } } }; break;
      case 'acos': outerDeriv = { type: 'neg', a: { type: 'div', a: { type: 'num', value: 1 }, b: { type: 'func', name: 'sqrt', arg: { type: 'sub', a: { type: 'num', value: 1 }, b: { type: 'pow', a: u, b: { type: 'num', value: 2 } } } } } }; break;
      case 'atan': outerDeriv = { type: 'div', a: { type: 'num', value: 1 }, b: { type: 'add', a: { type: 'num', value: 1 }, b: { type: 'pow', a: u, b: { type: 'num', value: 2 } } } }; break;
      case 'sinh': outerDeriv = { type: 'func', name: 'cosh', arg: u }; break;
      case 'cosh': outerDeriv = { type: 'func', name: 'sinh', arg: u }; break;
      case 'tanh': outerDeriv = { type: 'div', a: { type: 'num', value: 1 }, b: { type: 'pow', a: { type: 'func', name: 'cosh', arg: u }, b: { type: 'num', value: 2 } } }; break;
      case 'abs': outerDeriv = { type: 'div', a: u, b: node }; break;
      default: throw new CalcError(`Función no soportada: "${node.name}".`);
    }
    const result = { type: 'mul', a: outerDeriv, b: du };
    const elementaryFact = `La derivada de ${mathInline(toLatex(node))} es ${mathInline(toLatex(outerDeriv))}.`;
    const detail = chainNeeded
      ? `${elementaryFact} Como el argumento es ${mathInline(toLatex(u))} y no simplemente ${xVar}, se aplica la regla de la cadena multiplicando además por su derivada, ${mathInline(simplifiedLatex(du))}.`
      : elementaryFact;
    log(chainNeeded ? 'Regla de la cadena' : (FUNC_TITLE[node.name] || 'Derivada elemental'), node, result, detail);
    return result;
  }

  // ---------- Simplifier ----------
  function evalFuncNumeric(name, x) {
    switch (name) {
      case 'sin': return Math.sin(x); case 'cos': return Math.cos(x); case 'tan': return Math.tan(x);
      case 'cot': return 1 / Math.tan(x); case 'sec': return 1 / Math.cos(x); case 'csc': return 1 / Math.sin(x);
      case 'ln': return x > 0 ? Math.log(x) : null; case 'log': return x > 0 ? Math.log10(x) : null;
      case 'exp': return Math.exp(x); case 'sqrt': return x >= 0 ? Math.sqrt(x) : null;
      case 'asin': return Math.asin(x); case 'acos': return Math.acos(x); case 'atan': return Math.atan(x);
      case 'sinh': return Math.sinh(x); case 'cosh': return Math.cosh(x); case 'tanh': return Math.tanh(x);
      case 'abs': return Math.abs(x);
      default: return null;
    }
  }
  function sameExpr(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function simplify(node) {
    if (node.type === 'num' || node.type === 'const' || node.type === 'var') return node;
    if (node.type === 'neg') {
      const a = simplify(node.a);
      if (a.type === 'num') return { type: 'num', value: -a.value };
      if (a.type === 'neg') return a.a;
      return { type: 'neg', a };
    }
    if (node.type === 'func') {
      const arg = simplify(node.arg);
      if (node.name === 'ln' && arg.type === 'const' && arg.name === 'e') return { type: 'num', value: 1 };
      if (node.name === 'ln' && arg.type === 'num' && arg.value === 1) return { type: 'num', value: 0 };
      // Only fold functions that stay exact on rational input (sqrt, abs). Trig/log/exp of a plain
      // number are almost always irrational, so folding them would silently swap an exact symbolic
      // result (e.g. ln(2)) for a rounded decimal — contradicts the "exact derivative" promise.
      if (arg.type === 'num' && (node.name === 'sqrt' || node.name === 'abs')) {
        const v = evalFuncNumeric(node.name, arg.value);
        if (v !== null && Number.isFinite(v) && Number.isInteger(v)) return { type: 'num', value: v };
      }
      return { type: 'func', name: node.name, arg };
    }
    const a = simplify(node.a), b = simplify(node.b);
    if (node.type === 'mul') {
      // pull any fraction out of a product: (p/q)*r = (p*r)/q, r*(p/q) = (r*p)/q — this also
      // covers the classic quotient-rule leftovers like (1/x)*x -> 1 once the resulting div re-simplifies.
      if (a.type === 'div') return simplify({ type: 'div', a: { type: 'mul', a: a.a, b }, b: a.b });
      if (b.type === 'div') return simplify({ type: 'div', a: { type: 'mul', a, b: b.a }, b: b.b });
    }
    if (node.type === 'add') {
      if (a.type === 'num' && a.value === 0) return b;
      if (b.type === 'num' && b.value === 0) return a;
      if (a.type === 'num' && b.type === 'num') return { type: 'num', value: a.value + b.value };
      if (b.type === 'neg') return simplify({ type: 'sub', a, b: b.a });
      return { type: 'add', a, b };
    }
    if (node.type === 'sub') {
      if (b.type === 'num' && b.value === 0) return a;
      if (a.type === 'num' && a.value === 0) return simplify({ type: 'neg', a: b });
      if (a.type === 'num' && b.type === 'num') return { type: 'num', value: a.value - b.value };
      if (sameExpr(a, b)) return { type: 'num', value: 0 };
      return { type: 'sub', a, b };
    }
    if (node.type === 'mul') {
      if ((a.type === 'num' && a.value === 0) || (b.type === 'num' && b.value === 0)) return { type: 'num', value: 0 };
      if (a.type === 'num' && a.value === 1) return b;
      if (b.type === 'num' && b.value === 1) return a;
      if (a.type === 'num' && b.type === 'num') return { type: 'num', value: a.value * b.value };
      if (a.type === 'neg' && b.type === 'neg') return simplify({ type: 'mul', a: a.a, b: b.a });
      if (a.type === 'neg') return simplify({ type: 'neg', a: { type: 'mul', a: a.a, b } });
      if (b.type === 'neg') return simplify({ type: 'neg', a: { type: 'mul', a, b: b.a } });
      // fold a numeric coefficient into an already-coefficiented product: c1 * (c2 * X) -> (c1*c2) * X
      if (a.type === 'num' && b.type === 'mul' && b.a.type === 'num') return simplify({ type: 'mul', a: { type: 'num', value: a.value * b.a.value }, b: b.b });
      if (a.type === 'num' && b.type === 'mul' && b.b.type === 'num') return simplify({ type: 'mul', a: { type: 'num', value: a.value * b.b.value }, b: b.a });
      if (b.type === 'num' && a.type === 'mul' && a.a.type === 'num') return simplify({ type: 'mul', a: { type: 'num', value: b.value * a.a.value }, b: a.b });
      if (b.type === 'num' && a.type === 'mul' && a.b.type === 'num') return simplify({ type: 'mul', a: { type: 'num', value: b.value * a.b.value }, b: a.a });
      return { type: 'mul', a, b };
    }
    if (node.type === 'div') {
      if (a.type === 'num' && a.value === 0) return { type: 'num', value: 0 };
      if (b.type === 'num' && b.value === 1) return a;
      if (a.type === 'num' && b.type === 'num' && b.value !== 0) return { type: 'num', value: a.value / b.value };
      if (sameExpr(a, b)) return { type: 'num', value: 1 };
      return { type: 'div', a, b };
    }
    if (node.type === 'pow') {
      if (b.type === 'num' && b.value === 0) return { type: 'num', value: 1 };
      if (b.type === 'num' && b.value === 1) return a;
      if (a.type === 'num' && a.value === 1) return { type: 'num', value: 1 };
      if (a.type === 'num' && b.type === 'num') return { type: 'num', value: Math.pow(a.value, b.value) };
      return { type: 'pow', a, b };
    }
    return node;
  }
  const fullSimplify = (node) => simplify(simplify(node));

  // ---------- Printers ----------
  function fmtNum(x) {
    if (Number.isInteger(x)) return String(x);
    return x.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  }
  // ---------- LaTeX printer ----------
  // Every case handles its own parenthesization explicitly (no shared precedence-number
  // climbing) so grouping is easy to verify by inspection, rule by rule.
  const LATEX_FUNC = {
    sin: '\\sin', cos: '\\cos', tan: '\\tan', cot: '\\cot', sec: '\\sec', csc: '\\csc',
    asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
    sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
    ln: '\\ln', log: '\\log',
  };
  const FUNC_TITLE = {
    sin: 'Derivada del seno', cos: 'Derivada del coseno', tan: 'Derivada de la tangente',
    cot: 'Derivada de la cotangente', sec: 'Derivada de la secante', csc: 'Derivada de la cosecante',
    ln: 'Derivada del logaritmo natural', log: 'Derivada del logaritmo base 10', exp: 'Derivada de la función exponencial',
    sqrt: 'Derivada de la raíz cuadrada', asin: 'Derivada del arcoseno', acos: 'Derivada del arcocoseno', atan: 'Derivada del arcotangente',
    sinh: 'Derivada del seno hiperbólico', cosh: 'Derivada del coseno hiperbólico', tanh: 'Derivada de la tangente hiperbólica',
    abs: 'Derivada del valor absoluto',
  };
  function mathInline(latex) { return '$' + latex + '$'; }
  function simplifiedLatex(node) { return toLatex(fullSimplify(node)); }
  function wrapTex(s) { return `\\left(${s}\\right)`; }
  function isNegativeNode(n) { return n.type === 'neg' || (n.type === 'num' && n.value < 0); }
  function positiveLatex(n) { return n.type === 'neg' ? toLatex(n.a) : n.type === 'num' ? fmtNum(-n.value) : toLatex(n); }
  function toLatex(node) {
    switch (node.type) {
      case 'num': return fmtNum(node.value);
      case 'const': return node.name === 'pi' ? '\\pi' : 'e';
      case 'var': return node.name === '__yp__' ? "y'" : node.name;
      case 'neg': {
        const cs = toLatex(node.a);
        return '-' + ((node.a.type === 'add' || node.a.type === 'sub') ? wrapTex(cs) : cs);
      }
      case 'add':
        return isNegativeNode(node.b) ? `${toLatex(node.a)} - ${positiveLatex(node.b)}` : `${toLatex(node.a)} + ${toLatex(node.b)}`;
      case 'sub': {
        if (isNegativeNode(node.b)) return `${toLatex(node.a)} + ${positiveLatex(node.b)}`;
        const bs = toLatex(node.b);
        return `${toLatex(node.a)} - ${(node.b.type === 'add' || node.b.type === 'sub') ? wrapTex(bs) : bs}`;
      }
      case 'mul': {
        const wrapIf = n => (n.type === 'add' || n.type === 'sub') ? wrapTex(toLatex(n)) : toLatex(n);
        const aStr = wrapIf(node.a), bStr = wrapIf(node.b);
        return (node.a.type === 'num' && (node.b.type === 'var' || node.b.type === 'const')) ? `${aStr}${bStr}` : `${aStr} \\cdot ${bStr}`;
      }
      case 'div':
        return `\\frac{${toLatex(node.a)}}{${toLatex(node.b)}}`;
      case 'pow': {
        const baseNeedsParens = !['num', 'var', 'const', 'func'].includes(node.a.type);
        const baseStr = toLatex(node.a);
        return `${baseNeedsParens ? wrapTex(baseStr) : baseStr}^{${toLatex(node.b)}}`;
      }
      case 'func': {
        if (node.name === 'sqrt') return `\\sqrt{${toLatex(node.arg)}}`;
        if (node.name === 'exp') return `e^{${toLatex(node.arg)}}`;
        if (node.name === 'abs') return `\\left|${toLatex(node.arg)}\\right|`;
        return `${LATEX_FUNC[node.name] || `\\operatorname{${node.name}}`}\\left(${toLatex(node.arg)}\\right)`;
      }
    }
  }
  function toJSExpr(node) {
    switch (node.type) {
      case 'num': return String(node.value);
      case 'const': return node.name === 'pi' ? 'Math.PI' : 'Math.E';
      case 'var': return node.name;
      case 'neg': return `(-${toJSExpr(node.a)})`;
      case 'add': return `(${toJSExpr(node.a)}+${toJSExpr(node.b)})`;
      case 'sub': return `(${toJSExpr(node.a)}-${toJSExpr(node.b)})`;
      case 'mul': return `(${toJSExpr(node.a)}*${toJSExpr(node.b)})`;
      case 'div': return `(${toJSExpr(node.a)}/${toJSExpr(node.b)})`;
      case 'pow': return `Math.pow(${toJSExpr(node.a)},${toJSExpr(node.b)})`;
      case 'func': {
        if (node.name === 'cot') return `(1/Math.tan(${toJSExpr(node.arg)}))`;
        if (node.name === 'sec') return `(1/Math.cos(${toJSExpr(node.arg)}))`;
        if (node.name === 'csc') return `(1/Math.sin(${toJSExpr(node.arg)}))`;
        if (node.name === 'log') return `Math.log10(${toJSExpr(node.arg)})`;
        if (node.name === 'ln') return `Math.log(${toJSExpr(node.arg)})`;
        return `Math.${node.name}(${toJSExpr(node.arg)})`;
      }
    }
  }
  function compileFn(node, varName) {
    return new Function(varName, 'return ' + toJSExpr(node) + ';');
  }

  // ---------- First-principles (limit definition) derivation ----------
  // For elementary/polynomial functions we prefer deriving from the definition of the
  // derivative — substitution, binomial expansion, cancellation, and evaluating the limit —
  // instead of just citing the power rule. Falls back to null (rule-based path) when the
  // function isn't a pure polynomial in the diff variable, or its degree makes a full
  // expansion impractical.
  function nCr(n, k) {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return Math.round(r);
  }
  function extractPolyTerms(node, varName) {
    const terms = [];
    function isPowVar(m) {
      return (m.type === 'var' && m.name === varName) ||
        (m.type === 'pow' && m.a.type === 'var' && m.a.name === varName && m.b.type === 'num' && Number.isInteger(m.b.value) && m.b.value >= 0);
    }
    function degOf(m) { return m.type === 'var' ? 1 : m.b.value; }
    function walk(n, sign) {
      if (n.type === 'add') return walk(n.a, sign) && walk(n.b, sign);
      if (n.type === 'sub') return walk(n.a, sign) && walk(n.b, -sign);
      if (n.type === 'neg') return walk(n.a, -sign);
      if (n.type === 'num') { terms.push({ coef: sign * n.value, degree: 0 }); return true; }
      if (isPowVar(n)) { terms.push({ coef: sign, degree: degOf(n) }); return true; }
      if (n.type === 'mul') {
        if (n.a.type === 'num' && isPowVar(n.b)) { terms.push({ coef: sign * n.a.value, degree: degOf(n.b) }); return true; }
        if (n.b.type === 'num' && isPowVar(n.a)) { terms.push({ coef: sign * n.b.value, degree: degOf(n.a) }); return true; }
        return false;
      }
      return false;
    }
    if (!walk(node, 1)) return null;
    const byDegree = new Map();
    for (const t of terms) byDegree.set(t.degree, (byDegree.get(t.degree) || 0) + t.coef);
    return [...byDegree.entries()].map(([degree, coef]) => ({ degree, coef })).filter(t => t.coef !== 0).sort((a, b) => b.degree - a.degree);
  }
  function polyTermLatex(coef, degree, varName) {
    const absCoef = Math.abs(coef);
    if (degree === 0) return fmtNum(absCoef);
    const coefPart = absCoef === 1 ? '' : fmtNum(absCoef);
    const varPart = degree === 1 ? varName : `${varName}^{${degree}}`;
    return `${coefPart}${varPart}`;
  }
  function polyToLatex(terms, varName) {
    if (!terms.length) return '0';
    return terms.map((t, i) => {
      const piece = polyTermLatex(t.coef, t.degree, varName);
      return i === 0 ? (t.coef < 0 ? '-' : '') + piece : (t.coef < 0 ? ' - ' : ' + ') + piece;
    }).join('');
  }
  function polyAtXPlusHLatex(terms, varName) {
    if (!terms.length) return '0';
    return terms.map((t, i) => {
      const absCoef = Math.abs(t.coef);
      let piece;
      if (t.degree === 0) piece = fmtNum(absCoef);
      else {
        const base = t.degree === 1 ? `(${varName}+h)` : `(${varName}+h)^{${t.degree}}`;
        piece = (absCoef === 1 ? '' : fmtNum(absCoef) + ' \\cdot ') + base;
      }
      return i === 0 ? (t.coef < 0 ? '-' : '') + piece : (t.coef < 0 ? ' - ' : ' + ') + piece;
    }).join('');
  }
  function xhTermLatex(absCoef, xPow, hPow, varName) {
    const parts = [];
    if (absCoef !== 1 || (xPow === 0 && hPow === 0)) parts.push(fmtNum(absCoef));
    if (xPow === 1) parts.push(varName); else if (xPow > 1) parts.push(`${varName}^{${xPow}}`);
    if (hPow === 1) parts.push('h'); else if (hPow > 1) parts.push(`h^{${hPow}}`);
    return parts.join('');
  }
  function joinXHTerms(flatTerms, varName) {
    if (!flatTerms.length) return '0';
    return flatTerms.map((t, i) => {
      const piece = xhTermLatex(Math.abs(t.coef), t.xPow, t.hPow, varName);
      return i === 0 ? (t.coef < 0 ? '-' : '') + piece : (t.coef < 0 ? ' - ' : ' + ') + piece;
    }).join('');
  }
  function expandTermToXH(term) {
    const out = [];
    for (let k = 0; k <= term.degree; k++) out.push({ xPow: term.degree - k, hPow: k, coef: term.coef * nCr(term.degree, k) });
    return out;
  }
  function tryLimitDerivation(node, xVar, derivativeNode) {
    const terms = extractPolyTerms(node, xVar);
    if (!terms || !terms.length || terms.some(t => t.degree > 6)) return null;

    if (terms.length === 1 && terms[0].degree === 0) {
      const c = fmtNum(terms[0].coef);
      return [
        { title: 'Definición de derivada por límites', note: '', math: `f'(${xVar}) = \\lim_{h \\to 0} \\frac{f(${xVar}+h) - f(${xVar})}{h}` },
        { title: 'Sustituye la función constante', note: `Como la función es constante, ${mathInline('f(' + xVar + '+h)')} y ${mathInline('f(' + xVar + ')')} valen ambos ${mathInline(c)}.`, math: `\\lim_{h \\to 0} \\frac{${c} - ${c}}{h}` },
        { title: 'Evalúa el límite', note: 'El numerador es cero para cualquier $h$, así que el límite completo es cero.', math: `\\lim_{h \\to 0} \\frac{0}{h} = 0` },
      ];
    }

    const flatAll = terms.flatMap(expandTermToXH);
    const needsExpand = terms.some(t => t.degree >= 2);
    const surviving = flatAll.filter(t => t.hPow >= 1);
    const divided = surviving.map(t => ({ xPow: t.xPow, hPow: t.hPow - 1, coef: t.coef }));
    const finalTerms = divided.filter(t => t.hPow === 0);

    const steps = [
      { title: 'Definición de derivada por límites', note: '', math: `f'(${xVar}) = \\lim_{h \\to 0} \\frac{f(${xVar}+h) - f(${xVar})}{h}` },
      { title: 'Sustituye la función', note: `Se reemplaza ${mathInline('f(' + xVar + '+h)')} por la función evaluada en ${mathInline(xVar + '+h')}, y ${mathInline('f(' + xVar + ')')} por la función original.`, math: `\\lim_{h \\to 0} \\frac{${polyAtXPlusHLatex(terms, xVar)} - \\left(${polyToLatex(terms, xVar)}\\right)}{h}` },
    ];
    if (needsExpand) {
      steps.push({ title: 'Expande cada potencia de $(' + xVar + '+h)$', note: 'Se desarrolla el binomio de cada término.', math: `\\lim_{h \\to 0} \\frac{${joinXHTerms(flatAll, xVar)} - \\left(${polyToLatex(terms, xVar)}\\right)}{h}` });
    }
    steps.push({ title: 'Cancela los términos que no tienen $h$', note: `Los términos sin ${mathInline('h')} coinciden exactamente con ${mathInline('f(' + xVar + ')')} y se cancelan con el resto.`, math: `\\lim_{h \\to 0} \\frac{${joinXHTerms(surviving, xVar)}}{h}` });
    steps.push({ title: 'Factoriza $h$ y simplifica', note: `Cada término del numerador tiene un factor ${mathInline('h')}, que se cancela con el denominador.`, math: `\\lim_{h \\to 0} \\left(${joinXHTerms(divided, xVar)}\\right)` });
    steps.push({ title: 'Evalúa el límite cuando $h \\to 0$', note: `Todos los términos que aún tienen ${mathInline('h')} se anulan, dejando solo el resultado final.`, math: `${toLatex(derivativeNode)}` });
    return steps;
  }

// ---------- AST layout (pure; rendering to a specific <svg> stays page-side) ----------
  function layoutAST(node) {
    let xCounter = 0;
    const nodes = [], edges = [];
    function label(n) {
      switch (n.type) {
        case 'num': return fmtNum(n.value);
        case 'const': return n.name === 'pi' ? 'π' : 'e';
        case 'var': return n.name === '__yp__' ? "y'" : n.name;
        case 'neg': return '−'; case 'add': return '+'; case 'sub': return '−';
        case 'mul': return '×'; case 'div': return '÷'; case 'pow': return '^';
        case 'func': return n.name;
      }
    }
    function visit(n, depth, parentId) {
      const id = nodes.length;
      const isLeaf = ['num', 'const', 'var'].includes(n.type);
      nodes.push({ id, x: 0, depth, label: label(n), leaf: isLeaf });
      if (parentId !== null) edges.push([parentId, id]);
      if (isLeaf) { nodes[id].x = xCounter++; return id; }
      const childIds = [];
      if (n.type === 'neg') childIds.push(visit(n.a, depth + 1, id));
      else if (n.type === 'func') childIds.push(visit(n.arg, depth + 1, id));
      else { childIds.push(visit(n.a, depth + 1, id)); childIds.push(visit(n.b, depth + 1, id)); }
      nodes[id].x = childIds.reduce((s, cid) => s + nodes[cid].x, 0) / childIds.length;
      return id;
    }
    visit(node, 0, null);
    return { nodes, edges };
  }
