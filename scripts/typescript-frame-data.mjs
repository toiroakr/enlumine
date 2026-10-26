import {js_frame_spec as base} from "@twinkleplop/javascript";
import {compileFrameSpecs} from "./frame-specs.mjs";

const statements=["if","else","for","while","do","switch","case","break","continue","throw","try","catch","finally","function","class","interface","enum","namespace","module","import","export","return"];
const flag=(name,arm,clear)=>({name,arm:{type:"keyword",texts:arm},clear:{type:"keyword",texts:clear},clear_chars:";",clear_on_brace_close:true});

export async function typescriptFrameData() {
  const [data,javascript]=await compileFrameSpecs([{
    ...base,
    brace_kinds:{
      ...base.brace_kinds,
      prev_rules:[{prev_type:"identifier",prev_texts:["global"],kind:"block"},...base.brace_kinds.prev_rules],
      body_markers:[...base.brace_kinds.body_markers,
        {type:"keyword",text:"namespace",kind:"block"},{type:"keyword",text:"module",kind:"block"}],
    },
    ternary:{qmark:{type:"operator",text:"?"},colon_char:":",optional_member_kinds:["class","interface","type_literal","object"]},
    stmt_flags:[
      flag("var_decl",["let","const","var"],statements),
      flag("iface_head",["interface"],statements.filter(item=>item!=="interface")),
      flag("alias_head",["type"],statements),
    ],
  },base]);
  return `import {loadGrammar as enlumineFrameSpecData} from "@enlumine/core";
export const typescriptFrames=${data};
export const javascriptFrames=${javascript};`;
}
