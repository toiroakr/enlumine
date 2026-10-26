const context = (source, start) => source.slice(Math.max(0, start - 240), start).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");

const afterTypeKeyword = (source, start) => /\btype\s+$/.test(context(source, start));

const modifiers = "@\\w+(?:\\s*\\([^)]*\\))?\\s*|(?:readonly|public|private|protected|static|abstract|declare|override|accessor|get|set|async)\\s+";
const memberPrefix = new RegExp(`(?:^|[;{}\\n])[ \\t]*(?:${modifiers})*\\*?\\s*#?(?:\\[[\\w.]*)?$`);
const atMemberStart = (source, start) => memberPrefix.test(context(source, start));

const inParameterList = (source, start) => /(?:[(,{[:]|\.\.\.)\s*$/.test(context(source, start));
const afterTypeof = (source, start) => /\btypeof\s+(?:[\w$]+\s*\.\s*)*$/.test(context(source, start));
const afterEnumKeyword = (source, start) => /\benum\s+$/.test(context(source, start));
const enumMember = (source, start) => /\benum\s+[\w$]+\s*\{(?:[^{}]*,)?\s*$/.test(context(source, start));
const unterminatedAngles = (source, start, end) => source.indexOf(">", end) === -1;

const softKeywords = new Set("type from of as get set async static readonly declare abstract accessor override module namespace".split(" "));
const softKeyword = (source, start, end) => softKeywords.has(source.slice(start, end));

const angleAfterSoftKeyword = (source, start, end) =>
  /^[<>]+$/.test(source.slice(start, end)) && new RegExp(`\\b(?:${[...softKeywords].join("|")})\\s*<`).test(source.slice(source.lastIndexOf("\n", start - 1) + 1, end));

const typeParameterOfSoftKeyword = (source, start) => new RegExp(`\\b(?:${[...softKeywords].join("|")})\\s*<[^>]*$`).test(source.slice(source.lastIndexOf("\n", start - 1) + 1, start));

const softAlternation = [...softKeywords].join("|");
const afterSoftBinding = (source, start) => new RegExp(`(?:const|let|var)\\s+(?:[^;]*,\\s*)?(?:${softAlternation})\\s*=[^;]*$`).test(context(source, start).replace(/^[^]*;/, ""));
const bindsArrowWithSoftParameter = (source, start, end) => new RegExp(`^\\s*=\\s*(?:async\\s+)?\\(?[^()=]*\\b(?:${softAlternation})\\b[^()=]*\\)?\\s*=>`).test(source.slice(end, end + 200));

const afterJump = (source, start) => /\b(?:break|continue)[ \t]+$/.test(context(source, start));
const labelDefinition = (source, start, end) => /^(?:\s|\/\*[^]*?\*\/|\/\/[^\n]*\n)*:/.test(source.slice(end, end + 200)) && /(?:^|[;{}])\s*$/.test(context(source, start));

const improvements = [
  { from: "identifier", to: "parameter" },
  { from: "type", to: "parameter", when: inParameterList },
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
  ...["identifier", "function", "parameter", "property", "constant", "class_name", "type", "namespace", "label"].map(to => ({ from: "keyword", to, when: softKeyword })),
  { from: "operator", to: "punctuation", when: angleAfterSoftKeyword },
  { from: "identifier", to: "type", when: typeParameterOfSoftKeyword },
  { from: "type", to: "identifier", when: afterSoftBinding },
  { from: "type", to: "identifier", when: afterTypeof },
  { from: "identifier", to: "class_name", when: afterEnumKeyword },
  { from: "identifier", to: "constant", when: enumMember },
  { from: "constant", to: "function", when: bindsArrowWithSoftParameter },
  ...["identifier", "type"].map(from => ({ from, to: "label", when: (source, start, end) => afterJump(source, start) || labelDefinition(source, start, end) })),
];

export function differences(actual, expected, source) {
  const { tokens, token_types } = actual;
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
