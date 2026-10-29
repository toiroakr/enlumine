import ts from "typescript";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {createHash} from "node:crypto";

const grammarSignature="c608b58e094803ced6a33e4b971895e7540c239b8f1bbfaa33de37476deb3708";
const tokenNames=["comment","string","identifier","operator","variable","number","punctuation","string_escape","bit"];

function characterClass(rules) {
  const values=new Set();
  for(const rule of rules) {
    for(const text of typeof rule.match==="string"?[rule.match]:rule.match??[]) {
      if(text.length!==1)throw new Error("Unsupported SQL probe pattern");
      values.add(text.charCodeAt(0));
    }
    for(const [first,last] of rule.range??[])
      for(let code=first.charCodeAt(0);code<=last.charCodeAt(0);code++)values.add(code);
  }
  const ordered=[...values].toSorted((a,b)=>a-b),parts=[];
  const escape=code=>{
    const short={9:"\\t",10:"\\n",11:"\\v",12:"\\f",13:"\\r"}[code];
    if(short)return short;
    if(code>=32&&code<=126) {
      const char=String.fromCharCode(code);
      return "\\[]^-".includes(char)?"\\"+char:char;
    }
    return code<=255?`\\x${code.toString(16).padStart(2,"0")}`:`\\u${code.toString(16).padStart(4,"0")}`;
  };
  for(let i=0;i<ordered.length;i++) {
    const first=ordered[i];
    let last=first;
    while(ordered[i+1]===last+1)last=ordered[++i];
    const range=escape(first)+(last===first?"":"-"+escape(last));
    const literals=ordered.slice(i-(last-first),i+1).map(escape).join("");
    parts.push(literals.length<range.length?literals:range);
  }
  return parts.join("");
}

async function upstream() {
  const path=fileURLToPath(import.meta.resolve("@twinkleplop/sql"));
  const source=await readFile(path,"utf8");
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  let wordTable;
  const edits=[];
  for(const node of ast.statements) {
    if(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node))continue;
    if(!node.moduleSpecifier)continue;
    const specifier=node.moduleSpecifier.text;
    const url=specifier.startsWith(".")?pathToFileURL(resolve(dirname(path),specifier)).href:import.meta.resolve(specifier);
    edits.push({start:node.moduleSpecifier.getStart(ast),end:node.moduleSpecifier.end,text:JSON.stringify(url)});
    const bindings=node.importClause?.namedBindings;
    if(ts.isImportDeclaration(node)&&specifier==="@twinkleplop/core"&&bindings&&ts.isNamedImports(bindings))
      for(const binding of bindings.elements)
        if((binding.propertyName?.text??binding.name.text)==="compile_word_table")wordTable=binding.name.text;
  }
  let groups;
  function visit(node) {
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text===wordTable) {
      const options=node.arguments[1];
      if(groups||node.arguments.length!==2||!ts.isObjectLiteralExpression(options)||options.properties.length!==1||
          options.properties[0].name?.getText(ast)!=="fold"||!["true","!0"].includes(options.properties[0].initializer?.getText(ast)))
        throw new Error("Unsupported SQL vocabulary construction");
      groups=node.arguments[0].getText(ast);
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  if(!groups)throw new Error("Missing SQL vocabulary");
  let rewritten=source;
  for(const edit of edits.toSorted((a,b)=>b.start-a.start))
    rewritten=rewritten.slice(0,edit.start)+edit.text+rewritten.slice(edit.end);
  let name="enlumineSqlVocabulary";
  while(source.includes(name))name+="_";
  rewritten+=`\nexport const ${name}=${groups};\n`;
  const module=await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`);
  const signature=createHash("sha256").update(JSON.stringify(module.raw_grammar)).digest("hex");
  if(signature!==grammarSignature||JSON.stringify(module.grammar.token_types)!==JSON.stringify(tokenNames))
    throw new Error("SQL grammar changed; update the lexical adapter and run compatibility checks");
  const seen=new Set();
  const wordGroups=module[name].map(group=>{
    const words=[];
    for(const word of group) {
      if(typeof word!=="string"||!word.length||/\s/.test(word))throw new Error("Unsupported SQL vocabulary spelling");
      if(seen.has(word))continue;
      seen.add(word);
      words.push(word);
    }
    if(!words.length)throw new Error("Unsupported empty SQL vocabulary group");
    return words.sort().reverse().join(" ");
  });
  const packageRoot=resolve(path,"../..");
  const manifest=JSON.parse(await readFile(resolve(packageRoot,"package.json"),"utf8"));
  const license=await readFile(resolve(packageRoot,"LICENSE"),"utf8");
  return {data:{token_types:tokenNames,word_groups:wordGroups},raw:module.raw_grammar,signature,manifest,license};
}

export async function sqlLexicalData() {
  const {data,raw,signature,manifest,license}=await upstream();
  if(data.word_groups.length!==3)throw new Error("Unsupported SQL word classification groups");
  const lengths=data.word_groups.flatMap(group=>group.split(" ").map(word=>word.length));
  const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const operators=raw.states.main.rules.find(rule=>rule.token==="operator").match
    .filter(text=>text.length>1).toSorted((a,b)=>b.length-a.length).map(escape).join("|");
  const numeric=String.raw`0x[\da-f_]*|0b[01_]*|0o[0-7_]*|[\d_]+(?:\.[\d_]*)?(?:e[+-]?\d*)?`;
  const main=String.raw`--[^\n]*(?:\n|$)|\/\*|@@?[A-Za-z_][\w$]*|${operators}|#[^\n]*(?:\n|$)|\$[A-Za-z_\u0080-￿][\w\u0080-￿]*\$|\$\$|\$\d+|:[\w$]*|\?\d*|[\s\S]`;
  let contents=`export const wordGroups=${JSON.stringify(data.word_groups)};\n`;
  contents+=`export const tokenTypes=${JSON.stringify(tokenNames)};\n`;
  const members=tokenNames.concat("keyword","boolean","type").map((name,index)=>name.split("_").map(part=>part[0].toUpperCase()+part.slice(1)).join("")+"="+index);
  contents+=`export const enum Kind {${members.join(",")}}\nexport const min=${Math.min(...lengths)},max=${Math.max(...lengths)};\n`;
  contents+=`export const main=${new RegExp(main,"y")};\nexport const numberPattern=${new RegExp(numeric,"iy")};\n`;
  const probes=new Map();
  for(const [name,stateName] of [["atProbe","at_probe"],["atAtProbe","at_at_probe"],["dollarProbe","dollar_probe"]]) {
    const state=raw.states[stateName];
    const pattern=`[^${characterClass(state.rules)}]*[${characterClass(state.rules.filter(rule=>rule.state!==state.fallback))}]`;
    const existing=probes.get(pattern);
    contents+=`export const ${name}=${existing??new RegExp(pattern,"y")};\n`;
    probes.set(pattern,existing??name);
  }
  const notice=`${manifest.name}@${manifest.version}\n${license}`;
  return {contents,notice,packageName:manifest.name,metadata:{engine:"sql-lexical",upstreamVersion:manifest.version,grammarSha256:signature,words:lengths.length,wordEncoding:"plain"}};
}
