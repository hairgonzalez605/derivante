// Derivante — Dictado matemático por voz
// Turns spoken Spanish into the exact same linear syntax a user would type by hand, then hands it
// to the existing tokenize/insertImplicitMultiplication/parse pipeline from engine.js unchanged —
// the rest of the app never knows an expression came from voice instead of the keyboard.
// Loaded after engine.js. Plain globals (no IIFE) so the page script can call them directly.

  // ---------- Speech-to-text engine (swappable) ----------
  // Only this function talks to the browser's Web Speech API. To use a different engine later
  // (Whisper, a cloud STT service, etc.), write a factory with the same { start, stop, abort }
  // shape and the same onStart/onPartial/onFinal/onEnd/onError callbacks, and swap the factory
  // used when wiring the mic button — nothing else in the app needs to change.
  function isSpeechRecognitionSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function createWebSpeechEngine({ lang = 'es-ES', onPartial, onFinal, onStart, onEnd, onError } = {}) {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => onStart && onStart();
    rec.onerror = (e) => onError && onError(e.error || 'unknown');
    rec.onend = () => onEnd && onEnd();
    rec.onresult = (event) => {
      let interim = '', final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript; else interim += transcript;
      }
      if (interim) onPartial && onPartial(interim);
      if (final) onFinal && onFinal(final);
    };
    return { start: () => rec.start(), stop: () => rec.stop(), abort: () => rec.abort() };
  }

  // ---------- Text normalization ----------
  function stripAccents(s) { return s.normalize('NFD').replace(/\p{Diacritic}/gu, ''); }

  const SPOKEN_FILLER_PREFIXES = [
    'la funcion es', 'la expresion es', 'la funcion', 'la expresion',
    'deriva la funcion', 'derivar la funcion', 'calcula la derivada de', 'calcular la derivada de',
    'deriva', 'derivar', 'calcula', 'calcular',
  ];

  const SPOKEN_UNITS = { cero:0, uno:1, dos:2, tres:3, cuatro:4, cinco:5, seis:6, siete:7, ocho:8, nueve:9,
    diez:10, once:11, doce:12, trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17, dieciocho:18, diecinueve:19,
    veinte:20, veintiuno:21, veintidos:22, veintitres:23, veinticuatro:24, veinticinco:25, veintiseis:26, veintisiete:27, veintiocho:28, veintinueve:29 };
  const SPOKEN_TENS = { treinta:30, cuarenta:40, cincuenta:50, sesenta:60, setenta:70, ochenta:80, noventa:90 };

  // Best-effort safety net for small spoken numbers ("treinta y dos" -> "32"); most browsers'
  // speech recognizers already emit digits for numbers, so this rarely has to do anything.
  function collapseSpokenNumbers(words) {
    const out = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w === 'cien' || w === 'ciento') { out.push('100'); continue; }
      if (SPOKEN_TENS[w] !== undefined) {
        if (words[i + 1] === 'y' && SPOKEN_UNITS[words[i + 2]] !== undefined && SPOKEN_UNITS[words[i + 2]] < 10) {
          out.push(String(SPOKEN_TENS[w] + SPOKEN_UNITS[words[i + 2]]));
          i += 2;
          continue;
        }
        out.push(String(SPOKEN_TENS[w]));
        continue;
      }
      if (SPOKEN_UNITS[w] !== undefined) { out.push(String(SPOKEN_UNITS[w])); continue; }
      out.push(w);
    }
    return out;
  }

  // ---------- Phrase dictionary ----------
  // Longest phrase wins (checked 3/2/1 words at each position), so e.g. "seno hiperbolico" is
  // matched whole before the bare "seno" rule ever gets a chance.
  const SPOKEN_PHRASES = [
    [['seno','hiperbolico'], { t: 'func', v: 'sinh' }],
    [['coseno','hiperbolico'], { t: 'func', v: 'cosh' }],
    [['tangente','hiperbolica'], { t: 'func', v: 'tanh' }],
    [['logaritmo','natural'], { t: 'func', v: 'ln' }],
    [['arco','seno'], { t: 'func', v: 'asin' }],
    [['arco','coseno'], { t: 'func', v: 'acos' }],
    [['arco','tangente'], { t: 'func', v: 'atan' }],
    [['arcoseno'], { t: 'func', v: 'asin' }],
    [['arcocoseno'], { t: 'func', v: 'acos' }],
    [['arcotangente'], { t: 'func', v: 'atan' }],
    [['logaritmo'], { t: 'func', v: 'log' }],
    [['seno'], { t: 'func', v: 'sin' }],
    [['coseno'], { t: 'func', v: 'cos' }],
    [['tangente'], { t: 'func', v: 'tan' }],
    [['cotangente'], { t: 'func', v: 'cot' }],
    [['secante'], { t: 'func', v: 'sec' }],
    [['cosecante'], { t: 'func', v: 'csc' }],
    [['exponencial'], { t: 'func', v: 'exp' }],

    [['raiz','cuadrada','de'], { t: 'sqrt' }],
    [['raiz','cuadrada'], { t: 'sqrt' }],
    [['raiz','cubica','de'], { t: 'cbrt' }],
    [['raiz','cubica'], { t: 'cbrt' }],
    [['raiz','de'], { t: 'sqrt' }],
    [['raiz'], { t: 'sqrt' }],
    [['valor','absoluto','de'], { t: 'abs' }],
    [['valor','absoluto'], { t: 'abs' }],
    [['modulo','de'], { t: 'abs' }],
    [['modulo'], { t: 'abs' }],

    [['abre','parentesis'], { t: 'lparen' }],
    [['abrir','parentesis'], { t: 'lparen' }],
    [['parentesis','abierto'], { t: 'lparen' }],
    [['cierra','parentesis'], { t: 'rparen' }],
    [['cerrar','parentesis'], { t: 'rparen' }],
    [['parentesis','cerrado'], { t: 'rparen' }],

    [['elevado','a','la'], { t: 'pow' }],
    [['elevado','a'], { t: 'pow' }],
    [['a','la','potencia'], { t: 'pow' }],
    [['a','la'], { t: 'pow' }],
    [['potencia'], { t: 'pow' }],
    [['al','cuadrado'], { t: 'sq' }],
    [['al','cubo'], { t: 'cube' }],

    [['mas'], { t: 'op', v: '+' }],
    [['menos'], { t: 'op', v: '-' }],
    [['por'], { t: 'op', v: '*' }],
    [['dividido','entre'], { t: 'op', v: '/' }],
    [['dividido','por'], { t: 'op', v: '/' }],
    [['entre'], { t: 'op', v: '/' }],
    [['sobre'], { t: 'op', v: '/' }],

    [['pi'], { t: 'const', v: 'pi' }],
    [['e'], { t: 'const', v: 'e' }],
    [['infinito'], { t: 'infinity' }],

    // Spoken letter names. "d"/"de" is deliberately NOT mapped to the variable d: "de" is far more
    // frequently the function-argument connector ("seno de x") in this grammar.
    [['equis'], { t: 'var', v: 'x' }],
    [['y','griega'], { t: 'var', v: 'y' }],
    [['ye'], { t: 'var', v: 'y' }],
    [['zeta'], { t: 'var', v: 'z' }],
    [['te'], { t: 'var', v: 't' }],
    [['be'], { t: 'var', v: 'b' }],
    [['ce'], { t: 'var', v: 'c' }],
    [['ka'], { t: 'var', v: 'k' }],
    [['eme'], { t: 'var', v: 'm' }],
    [['ene'], { t: 'var', v: 'n' }],
    [['ere'], { t: 'var', v: 'r' }],
    [['ese'], { t: 'var', v: 's' }],
    [['uve'], { t: 'var', v: 'v' }],

    [['de'], { t: 'de' }],
  ].sort((a, b) => b[0].length - a[0].length);

  function lexSpokenWords(words) {
    const tokens = [];
    const warnings = [];
    let i = 0;
    outer:
    while (i < words.length) {
      for (let len = 3; len >= 1; len--) {
        if (i + len > words.length) continue;
        const slice = words.slice(i, i + len).join(' ');
        const match = SPOKEN_PHRASES.find(([ws]) => ws.length === len && ws.join(' ') === slice);
        if (match) { tokens.push(match[1]); i += len; continue outer; }
      }
      const w = words[i];
      if (/^\d+(\.\d+)?$/.test(w)) { tokens.push({ t: 'num', v: parseFloat(w) }); i++; continue; }
      if (/^[a-z]$/.test(w)) { tokens.push({ t: 'var', v: w }); i++; continue; }
      warnings.push(w);
      i++;
    }
    return { tokens, warnings };
  }

  // ---------- Emitter: phrase tokens -> linear calculator syntax ----------
  // A stack of open "scopes" (one per function/root/abs call or explicit parenthesis) tracks
  // whether anything has been said inside it yet. That single flag resolves the two postfix-power
  // phrasings the same way: "seno DE x AL CUADRADO" closes the already-filled scope before squaring
  // ("sin(x)^2"), while "seno AL CUADRADO de x" defers the square (scope still empty) until the
  // argument arrives and the scope finally closes — same result, either order.
  // Any scope left open at the end of the utterance auto-closes there, which is what gives function
  // arguments their natural "greedy to the end" reading (e.g. "logaritmo de x mas uno" -> log(x+1)).
  function emitCalculatorString(tokens, opts = {}) {
    const earlyCloseId = opts.earlyCloseId;
    let out = '';
    const stack = [];
    let nextId = 1;

    function markAncestorsHaveContent() { for (const s of stack) s.hasContent = true; }
    function openScope(openText, closeSuffix, explicit) {
      markAncestorsHaveContent();
      out += openText;
      const scope = { id: nextId++, hasContent: false, pendingPostfix: null, closeSuffix: closeSuffix || '', hadTopLevelOp: false, explicit: !!explicit };
      stack.push(scope);
      return scope;
    }
    function popAndClose() {
      const scope = stack.pop();
      if (!scope) return null;
      out += ')';
      if (scope.pendingPostfix) out += '^' + scope.pendingPostfix;
      if (scope.closeSuffix) out += scope.closeSuffix;
      return scope;
    }

    for (const tok of tokens) {
      switch (tok.t) {
        case 'num': markAncestorsHaveContent(); out += fmtNum(tok.v); break;
        case 'var': markAncestorsHaveContent(); out += tok.v; break;
        case 'const': markAncestorsHaveContent(); out += tok.v; break;
        case 'func': openScope(tok.v + '(', ''); break;
        case 'sqrt': openScope('sqrt(', ''); break;
        case 'cbrt': openScope('(', '^(1/3)'); break;
        case 'abs': openScope('abs(', ''); break;
        case 'lparen': openScope('(', '', true); break;
        case 'rparen': popAndClose(); break;
        case 'pow': markAncestorsHaveContent(); out += '^'; break;
        case 'de': break; // pure connector, never emitted
        case 'op': {
          // Any explicit operator word (not just +/-) after a scope already has content is a
          // genuine fork: "seno de x por coseno de x" could mean sin(x*cos(x)) (stay inside) or
          // sin(x)*cos(x) (two factors) just as much as the documented "logaritmo de x mas uno"
          // case does for +. Both readings get generated and, if they differ, the ambiguity
          // dialog lets the user pick instead of silently guessing.
          const top = stack[stack.length - 1];
          if (top && top.hasContent && top.id === earlyCloseId) {
            popAndClose();
            out += tok.v;
            break;
          }
          if (top && top.hasContent && !top.explicit) top.hadTopLevelOp = true;
          markAncestorsHaveContent();
          out += tok.v;
          break;
        }
        case 'sq': case 'cube': {
          const power = tok.t === 'sq' ? '2' : '3';
          const top = stack[stack.length - 1];
          if (!top) out += '^' + power;
          else if (top.hasContent) { popAndClose(); out += '^' + power; }
          else top.pendingPostfix = power;
          break;
        }
        case 'infinity': break; // flagged as a warning upstream; this parser has no infinity literal
      }
    }
    let ambiguousScopeId = null;
    while (stack.length) {
      const scope = stack[stack.length - 1];
      if (!scope.explicit && scope.hadTopLevelOp && ambiguousScopeId === null) ambiguousScopeId = scope.id;
      popAndClose();
    }
    return { text: out, ambiguousScopeId };
  }

  // ---------- Top-level entry point ----------
  // Returns { candidates: [{ text, latex, label }], warnings: [unrecognized words], errorMessage }.
  // Two candidates only appear when the function-argument scope genuinely has two valid readings
  // (e.g. "logaritmo de x mas uno menos seno de x") — the caller should ask the user to pick.
  function interpretSpokenMath(rawText) {
    const normalized = stripAccents(rawText.toLowerCase()).replace(/[.,;:!¿?]/g, ' ').replace(/\s+/g, ' ').trim();
    let stripped = normalized;
    for (const prefix of SPOKEN_FILLER_PREFIXES) {
      if (stripped === prefix) { stripped = ''; break; }
      if (stripped.startsWith(prefix + ' ')) { stripped = stripped.slice(prefix.length + 1); break; }
    }
    let words = stripped.split(' ').filter(Boolean);
    words = collapseSpokenNumbers(words);
    const DEDUP_WORDS = ['mas', 'menos', 'por', 'entre', 'de'];
    words = words.filter((w, i) => !(i > 0 && w === words[i - 1] && DEDUP_WORDS.includes(w)));

    const { tokens, warnings } = lexSpokenWords(words);
    if (!tokens.length) {
      return { candidates: [], warnings, errorMessage: 'No se reconoció ninguna expresión matemática en lo que dijiste.' };
    }
    const hasInfinity = tokens.some(t => t.t === 'infinity');

    const results = [];
    function tryBuild(text, label) {
      if (results.some(r => r.text === text)) return;
      try {
        const parsed = parse(insertImplicitMultiplication(tokenize(text)));
        const latex = parsed.isEquation ? `${toLatex(parsed.left)} = ${toLatex(parsed.right)}` : toLatex(parsed.node);
        results.push({ text, latex, label });
      } catch (_) { /* not a valid reading, discard */ }
    }

    const primary = emitCalculatorString(tokens);
    tryBuild(primary.text, 'Interpretación directa');
    if (primary.ambiguousScopeId !== null) {
      const alt = emitCalculatorString(tokens, { earlyCloseId: primary.ambiguousScopeId });
      tryBuild(alt.text, 'Interpretación alternativa');
    }
    if (hasInfinity) warnings.push('El símbolo de infinito no es compatible con el motor de derivadas de esta calculadora.');
    if (!results.length) {
      return { candidates: [], warnings, errorMessage: 'Se entendieron las palabras, pero no forman una expresión matemática válida. Intenta reformular o edítala manualmente.' };
    }
    return { candidates: results, warnings, errorMessage: null };
  }
