const context = (source, start) => source.slice(Math.max(0, start - 240), start).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");

const literalKinds = new Set(["comment", "string", "template", "regex", "string_escape", "doctype", "raw_script", "raw_style"]);
let current = null, analyzed = null;
const brackets = source => {
  if (analyzed?.source === source && analyzed.table === current) return analyzed;
  const { tokens, token_types } = current, chars = source.split(""), erase = (from, to) => { for (let q = from; q < to; q++) if (chars[q] !== "\n") chars[q] = " "; };
  for (let i = 0; i < tokens.length; i += 3)
    if (literalKinds.has(token_types[tokens[i]])) erase(tokens[i + 1], token_types[tokens[i]] === "comment" && source.startsWith("/*", tokens[i + 1]) ? source.indexOf("*/", tokens[i + 1] + 2) + 2 || source.length : tokens[i + 2]);
  const text = chars.join(""), inner = new Int32Array(text.length + 1), parent = new Map(), match = new Map(), stack = [];
  for (let i = 0; i < text.length; i++) {
    inner[i] = stack.length ? stack[stack.length - 1] : -1;
    if ("({[".includes(text[i])) parent.set(i, inner[i]), stack.push(i);
    else if (")}]".includes(text[i]) && stack.length) match.set(stack.pop(), i);
  }
  inner[text.length] = stack.length ? stack[stack.length - 1] : -1;
  return analyzed = { source, table: current, text, inner, parent, match };
};
const headOf = (info, open) => info.text.slice(Math.max(0, open - 300), open);

const afterTypeKeyword = (source, start) => /\btype\s+$/.test(context(source, start));

const modifiers = "@\\w+(?:\\s*\\([^)]*\\))?\\s*|(?:readonly|public|private|protected|static|abstract|declare|override|accessor|get|set|async)\\s+";
const memberPrefix = new RegExp(`(?:^|[;{}\\n])[ \\t]*(?:${modifiers})*\\*?\\s*#?(?:\\[[\\w.]*)?$`);
const memberHead = /\$$|\b(?:class|interface)\b[^{};]*$|\btype\s+[\w$]+[^;{}]*=\s*$|[:=,(|&<]\s*$|\b(?:extends|implements|satisfies|as|new)\s*$/;
const flatten = head => { for (let previous = ""; previous !== head;) previous = head, head = head.replace(/\{[^{}]*\}/g, " "); return head; };
const memberScope = (info, open) => open >= 0 && info.text[open] === "{" && memberHead.test(flatten(headOf(info, open)));
const atMemberStart = (source, start) => {
  if (!memberPrefix.test(context(source, start))) return false;
  const info = brackets(source), open = info.inner[start];
  return memberScope(info, info.text[open] === "[" ? info.parent.get(open) : open);
};

const afterTypeof = (source, start) => /typeof\s+(?:[\w$]+\s*\.\s*)*$/.test(context(source, start));
const afterEnumKeyword = (source, start) => /\benum\s+$/.test(context(source, start));
const enumMember = (source, start) => /\benum\s+[\w$]+\s*\{(?:[^{}]*,)?\s*$/.test(context(source, start));
const unterminatedAngles = (source, start, end) => source.indexOf(">", end) === -1 && /[<,=[]\s*$/.test(context(source, start));

const softKeywords = new Set("type from of as get set async static readonly declare abstract accessor override module namespace".split(" "));
const softKeyword = (source, start, end) => softKeywords.has(source.slice(start, end)) && /^\s*(?:[)\]},;.:=(<>?!+\-*/%&|^~]|$)/.test(source.slice(end, end + 80));

const angleAfterSoftKeyword = (source, start, end) => {
  const text = source.slice(start, end), line = source.slice(source.lastIndexOf("\n", start - 1) + 1, start);
  const names = [...softKeywords].join("|");
  if (text === "<") return new RegExp(`\\b(?:${names})\\s*$`).test(line);
  return /^>+$/.test(text) && new RegExp(`\\b(?:${names})\\s*<[^;(){}]*$`).test(line);
};

const typeParameterOfSoftKeyword = (source, start) => new RegExp(`\\b(?:${[...softKeywords].join("|")})\\s*<[^>]*$`).test(source.slice(source.lastIndexOf("\n", start - 1) + 1, start));

const softAlternation = [...softKeywords].join("|");
const afterSoftBinding = (source, start) => new RegExp(`(?:const|let|var)\\s+(?:[^;]*,\\s*)?(?:${softAlternation})\\s*=[^;]*$`).test(context(source, start).replace(/^[^]*;/, ""));
const bindsArrowWithSoftParameter = (source, start, end) => new RegExp(`^\\s*=\\s*(?:async\\s+)?\\(?[^()=]*\\b(?:${softAlternation})\\b[^()=]*\\)?\\s*=>`).test(source.slice(end, end + 200));

const afterJump = (source, start) => /\b(?:break|continue)[ \t]+$/.test(context(source, start));
const notBlockHead = /(?:[=(,:[?]|\b(?:const|let|var|return|throw|typeof|case|new|extends|implements|in|of|yield|await))\s*$/;
const labelDefinition = (source, start, end) => {
  if (!/^(?:\s|\/\*[^]*?\*\/|\/\/[^\n]*\n)*:/.test(source.slice(end, end + 200)) || !/(?:^|[;{}])\s*(?:[\w$]+\s*:\s*)*$/.test(context(source, start))) return false;
  const info = brackets(source), open = info.inner[start];
  return open < 0 || info.text[open] === "{" && !notBlockHead.test(headOf(info, open)) && !memberScope(info, open);
};

const skipped = "(?:\\s|\\/\\*[^]*?\\*\\/|\\/\\/[^\\n]*\\n)*";
const followsName = new RegExp(`^${skipped}(?:=>|[:,;)=?\\]}]|\\.\\.\\.|$)`);
const beforeName = new RegExp(`(?:[(,{[]|\\.\\.\\.|\\b(?:${["public", "private", "protected", "readonly", "override", "async", "static", "accessor", "declare", "abstract", "get", "set"].join("|")}))\\s*$`);
const patternName = /^\s*(?:[,}\]=:]|\.\.\.|$)/;
const methodHead = /(?:^|[;{}\n,])\s*(?:(?:public|private|protected|static|abstract|declare|override|async|readonly|get|set)\s+)*[\w$]+\??\s*(?:<[^()]*>)?\s*$/;
const parameterPosition = (source, start, end) => {
  const info = brackets(source), { text } = info, after = text.slice(end, end + 1500);
  if (/^\s*=>/.test(after)) return true;
  const top = info.inner[start];
  if (top < 0) return false;
  if (text[top] === "[" && /^\s*:/.test(after)) return /(?:^|[;{}\n,])\s*(?:(?:readonly|public|private|protected|static|abstract|declare|override|accessor)\s+)*$/.test(headOf(info, top));
  let list = top;
  while (text[list] !== "(") if ((list = info.parent.get(list)) === undefined || list < 0) return false;
  if (list !== top ? !patternName.test(after) : !(followsName.test(after) && beforeName.test(context(source, start)))) return false;
  const head = headOf(info, list), close = info.match.get(list);
  if (/\b(?:function|catch)\s*\*?\s*[\w$]*\s*(?:<[^()]*>)?\s*$/.test(head)) return true;
  const rest = close === undefined ? "" : text.slice(close + 1, close + 400);
  if (/^\s*$/.test(rest)) return /=\s*(?:async\s*)?$/.test(head) || methodHead.test(head) && memberScope(info, info.inner[list]);
  if (/^\s*(?::[^;{}=]*)?=>/.test(rest)) return true;
  if (/^\s*[{:]/.test(rest)) return !/\b(?:if|while|for|switch|with|return|typeof|await)\s*$/.test(head);
  return /^\s*[;,]|^[^\S\n]*\n/.test(rest) && methodHead.test(head) && memberScope(info, info.inner[list]);
};

const improvements = [
  { from: "identifier", to: "parameter", when: parameterPosition },
  { from: "type", to: "parameter", when: parameterPosition },
  { from: "function", to: "type", when: afterTypeKeyword },
  { from: "function", to: "identifier", when: afterTypeKeyword },
  { from: "type", to: "property", when: atMemberStart },
  { from: "identifier", to: "property", when: atMemberStart },
  { from: "boolean", to: "property", when: atMemberStart },
  { from: "type", to: "function", when: atMemberStart },
  { from: "identifier", to: "function", when: atMemberStart },
  { from: "type", to: "identifier", when: atMemberStart },
  { from: "type", to: "identifier", when: unterminatedAngles },
  { from: "keyword", to: "property", when: atMemberStart },
  { from: "keyword", to: "function", when: atMemberStart },
  ...["identifier", "function", "parameter", "property", "constant", "class_name", "type", "namespace"].map(to => ({ from: "keyword", to, when: softKeyword })),
  { from: "keyword", to: "label", when: (source, start, end) => softKeyword(source, start, end) && labelDefinition(source, start, end) },
  { from: "operator", to: "punctuation", when: angleAfterSoftKeyword },
  { from: "identifier", to: "type", when: typeParameterOfSoftKeyword },
  { from: "type", to: "identifier", when: afterSoftBinding },
  { from: "type", to: "identifier", when: afterTypeof },
  ...["identifier", "constant"].map(from => ({ from, to: "class_name", when: afterEnumKeyword })),
  { from: "identifier", to: "constant", when: enumMember },
  { from: "constant", to: "function", when: bindsArrowWithSoftParameter },
  ...["identifier", "type", "constant"].map(from => ({ from, to: "label", when: (source, start, end) => afterJump(source, start) || labelDefinition(source, start, end) })),
];

export function differences(actual, expected, source) {
  const { tokens, token_types } = actual;
  current = actual;
  if (tokens.length !== expected.tokens.length || !expected.token_types.every(name => token_types.includes(name))) return null;
  if (token_types.some(name => name !== "label" && !expected.token_types.includes(name))) return null;
  const found = [];
  for (let i = 0; i < tokens.length; i += 3) {
    if (tokens[i + 1] !== expected.tokens[i + 1] || tokens[i + 2] !== expected.tokens[i + 2]) return null;
    if (token_types[tokens[i]] === expected.token_types[expected.tokens[i]]) continue;
    const from = expected.token_types[expected.tokens[i]], to = token_types[tokens[i]];
    const allowed = improvements.some(rule => rule.from === from && rule.to === to && (!rule.when || source !== undefined && rule.when(source, tokens[i + 1], tokens[i + 2])));
    found.push({ start: tokens[i + 1], end: tokens[i + 2], from, to, allowed });
  }
  return found;
}

export const sameTables = (actual, expected, source) => differences(actual, expected, source)?.every(change => change.allowed) ?? false;

const nonAscii = /(?![\s\u0085])[\u0080-\uffff]/.source;
const dollarTag = new RegExp(`^\\$(?:[A-Za-z_]|${nonAscii})(?:\\w|${nonAscii})*\\$`);

export const hasTaggedDollarQuote = ({ tokens, token_types }, source) => {
  for (let i = 0; i < tokens.length; i += 3) {
    if (token_types[tokens[i]] !== "string" || !dollarTag.test(source.slice(tokens[i + 1], tokens[i + 2]))) continue;
    const continues = i > 0 && tokens[i - 1] === tokens[i + 1] && token_types[tokens[i - 3]] === "string_escape";
    if (!continues) return true;
  }
  return false;
};

const identifierKinds = new Set(["identifier", "function", "variable"]);

// Adjacent identifier tokens are one name, and an escaped quote ("" or ]]) splits a quoted name into separate tokens,
// so quotes are followed over the whole run instead of per token.
const hasUnquotedNonAscii = (text) => {
  const closers = { '"': '"', "`": "`", "[": "]" };
  for (let i = 0; i < text.length; i++) {
    const closer = closers[text[i]];
    if (closer === undefined) {
      if (text.charCodeAt(i) > 127) return true;
      continue;
    }
    for (i++; i < text.length; i++) {
      if (text[i] !== closer) continue;
      if (text[i + 1] !== closer) break;
      i++;
    }
  }
  return false;
};

export const hasNonAsciiIdentifier = ({ tokens, token_types }, source) => {
  for (let i = 0; i < tokens.length; ) {
    if (!identifierKinds.has(token_types[tokens[i]])) {
      i += 3;
      continue;
    }
    const start = tokens[i + 1];
    let end = tokens[i + 2];
    for (i += 3; i < tokens.length && tokens[i + 1] === end && identifierKinds.has(token_types[tokens[i]]); i += 3) end = tokens[i + 2];
    if (hasUnquotedNonAscii(source.slice(start, end))) return true;
  }
  return false;
};

export const differsFromUpstream = (actual, source) => hasTaggedDollarQuote(actual, source) || hasNonAsciiIdentifier(actual, source);
