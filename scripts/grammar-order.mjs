import {gzipSync} from "node:zlib";
import {packGrammar} from "./pack-grammar.mjs";

const rowWidths = {
  transitions:768, char_maps:128, fallback_transitions:3,
  probe_mask:1, boundary_flags:256, run_kinds:256,
  seal_flags:256, fallback_seal_flags:1,
};

function unpack(value) {
  const length = value.$[1].reduce((sum, item, index) => sum + (index % 2 ? 0 : item),0);
  const ArrayType = value.$[0] === 8 ? Uint8Array : value.$[0] === 16 ? Uint16Array : Int32Array;
  const result = new ArrayType(length);
  let offset = 0;
  for (let i=0; i<value.$[1].length; i+=2) {
    result.fill(value.$[1][i+1],offset,offset+value.$[1][i]);
    offset += value.$[1][i];
  }
  return result;
}

function pack(value, original) {
  return {...original,...packGrammar(value)};
}

function tables(grammar) {
  if (!grammar?.char_maps?.$ || !grammar.transitions?.$ || !grammar.probe_mask?.$ ||
      !grammar.patterns_by_state || !grammar.non_ascii_by_state || grammar.probe_fallbacks?.$?.[0] !== 0) return;
  const data = {};
  for (const field of Object.keys(rowWidths)) if (grammar[field]) data[field] = unpack(grammar[field]);
  const states = data.probe_mask.length;
  if (!states || grammar.patterns_by_state.length !== states || grammar.non_ascii_by_state.length !== states) return;
  for (const [field,width] of Object.entries(rowWidths))
    if (data[field] && data[field].length !== states*width) return;
  return data;
}

export function reorderStates(grammar, order) {
  const data = tables(grammar);
  if (!data) return grammar;
  const states = data.probe_mask.length;
  if (order.length !== states || order[0] !== 0 || new Set(order).size !== states ||
      [...order].some(state => !Number.isInteger(state) || state < 0 || state >= states))
    throw new Error("State order must preserve state zero and contain every state exactly once");
  const inverse = [];
  order.forEach((state,index) => inverse[state]=index);
  const remap = state => {
    if (inverse[state] === undefined) throw new Error(`Unknown state: ${state}`);
    return inverse[state];
  };
  const result = {...grammar};
  for (const [field,width] of Object.entries(rowWidths)) if (data[field]) {
    const reordered = new data[field].constructor(data[field].length);
    order.forEach((state,index) => reordered.set(data[field].subarray(state*width,(state+1)*width),index*width));
    if (field === "transitions" || field === "fallback_transitions")
      for (let i=0; i<reordered.length; i+=3) {
        const next = reordered[i];
        if (next===65535) continue;
        if (next>=states) throw new Error(`Unknown transition state: ${next}`);
        reordered[i]=inverse[next];
      }
    result[field]=pack(reordered,grammar[field]);
  }
  for (const field of ["patterns_by_state","non_ascii_by_state"]) result[field]=order.map(state=>grammar[field][state]);
  result.probe_fallbacks={ $: [0, grammar.probe_fallbacks.$[1].map(([state,next])=>[remap(state),remap(next)])] };
  if (grammar.entry_states)
    result.entry_states=Object.fromEntries(Object.entries(grammar.entry_states).map(([name,state])=>[name,remap(state)]));
  return result;
}

function stateCandidates(grammar) {
  const data = tables(grammar);
  if (!data) return [];
  const states = data.probe_mask.length;
  const remaining = Array.from({length:states-1},(_,index)=>index+1);
  const maps = Array.from({length:states},(_,state)=>Array.from(data.char_maps.subarray(state*128,(state+1)*128)).join(","));
  const patterns = grammar.patterns_by_state.map(value=>JSON.stringify(value));
  const by = keys => [0,...remaining.toSorted((a,b)=>keys[a]<keys[b]?-1:keys[a]>keys[b]?1:a-b)];
  const orders = [
    ["character-map",by(maps)],
    ["patterns",by(patterns)],
    ["map-patterns",by(maps.map((key,state)=>key+patterns[state]))],
    ["probe-map",by(maps.map((key,state)=>data.probe_mask[state]+key))],
    ["reverse",[0,...remaining.toReversed()]],
  ];
  return orders.filter(([,order])=>order.some((state,index)=>state!==index));
}

function rules(grammar, data) {
  const result=[];
  for (let state=0;state<data.probe_mask.length;state++) {
    const found=new Map();
    const mark=rule=>{
      if (rule===65535) return;
      if (!Number.isInteger(rule) || rule<0 || rule>255) throw new Error(`Unknown rule: ${rule}`);
      if (!found.has(rule)) found.set(rule,{rule,chars:[],patterns:[],ranges:[],usage:0,first:Infinity});
      return found.get(rule);
    };
    for (let char=0;char<128;char++) {
      const item=mark(data.char_maps[state*128+char]);
      if (item) {item.chars.push(char);item.usage++;item.first=Math.min(item.first,char);}
    }
    const buckets=grammar.patterns_by_state[state]??[];
    for (let char=0;char<buckets.length;char++) for (const pattern of buckets[char]??[]) {
      const item=mark(pattern.rule_idx);
      if (item) {item.patterns.push({...pattern,rule_idx:undefined});item.usage++;item.first=Math.min(item.first,char);}
    }
    const packed=grammar.non_ascii_by_state[state];
    if (packed) {
      const ranges=unpack(packed);
      for (let i=0;i<ranges.length;i+=3) {
        const item=mark(ranges[i+2]);
        if (item) {
          item.ranges.push([ranges[i],ranges[i+1]]);
          item.usage+=Math.min(128,ranges[i+1]-ranges[i]+1);
          item.first=Math.min(item.first,ranges[i]);
        }
      }
    }
    result.push([...found.values()].sort((a,b)=>a.rule-b.rule));
  }
  return result;
}

export function reorderRules(grammar, mappings) {
  const data=tables(grammar);
  if (!data) return grammar;
  const states=data.probe_mask.length;
  if (mappings.length!==states) throw new Error("One rule map is required for every state");
  for (const mapping of mappings) {
    const used=new Set();
    mapping.forEach((next,rule)=>{
      if (!Number.isInteger(next) || next<0 || next>255 || rule>255 ||
          ((next===255 || rule===255) && next!==rule)) throw new Error("Rule 255 is reserved for fallback probes");
      if (used.has(next)) throw new Error("Rule IDs must be unique within a state");
      used.add(next);
    });
  }
  const remap=(state,rule)=>{
    if (rule===65535) return rule;
    const next=mappings[state][rule];
    if (next===undefined) throw new Error(`Missing rule: ${state}:${rule}`);
    return next;
  };
  const result={...grammar};
  for (const [field,width] of [["transitions",3],["run_kinds",1],["boundary_flags",1],["seal_flags",1]]) if (data[field]) {
    const reordered=new data[field].constructor(data[field].length);
    mappings.forEach((mapping,state)=>mapping.forEach((next,rule)=>{
      reordered.set(data[field].subarray((state*256+rule)*width,(state*256+rule+1)*width),(state*256+next)*width);
    }));
    if ((field==="boundary_flags" || field==="seal_flags") && !reordered.some(Boolean)) delete result[field];
    else result[field]=pack(reordered,grammar[field]);
  }
  result.char_maps=pack(data.char_maps.map((rule,index)=>remap(Math.floor(index/128),rule)),grammar.char_maps);
  result.patterns_by_state=grammar.patterns_by_state.map((row,state)=>row?.map(bucket=>bucket?.map(pattern=>({...pattern,rule_idx:remap(state,pattern.rule_idx)})))??row);
  result.non_ascii_by_state=grammar.non_ascii_by_state.map((row,state)=>{
    if (!row) return row;
    const ranges=unpack(row);
    for (let i=2;i<ranges.length;i+=3) ranges[i]=remap(state,ranges[i]);
    return pack(ranges,row);
  });
  return result;
}

function localRules(infos, compare) {
  return infos.map(list=>{
    const mapping=[];
    list.toSorted(compare).forEach(({rule},next)=>mapping[rule]=next);
    return mapping;
  });
}

function ruleGraph(grammar, data, infos, kind) {
  const nodes=new Map(),states=[];
  for (let state=0;state<infos.length;state++) {
    const seen=new Map(),row=[];
    for (const item of infos[state]) {
      const offset=(state*256+item.rule)*3;
      const target=data.transitions[offset];
      const signature=kind==="selector" ? [item.chars,item.patterns,item.ranges]
        : [target===state?"self":target===65535?"same":target,data.transitions[offset+1],data.transitions[offset+2],
          data.run_kinds?.[state*256+item.rule]??0,data.boundary_flags?.[state*256+item.rule]??0,data.seal_flags?.[state*256+item.rule]??0];
      const key=JSON.stringify(signature);
      const ordinal=seen.get(key)??0;
      seen.set(key,ordinal+1);
      const id=key+"\0"+ordinal;
      if (!nodes.has(id)) nodes.set(id,{id,edges:new Set(),frequency:0,weight:0,color:-1});
      const node=nodes.get(id);
      node.frequency++;
      node.weight+=item.usage;
      row.push({node,rule:item.rule});
    }
    for (const a of row) for (const b of row) if (a!==b) a.node.edges.add(b.node);
    states.push(row);
  }
  return {nodes:[...nodes.values()],states};
}

function colorRules(graph, rank) {
  for (const node of graph.nodes) node.color=-1;
  const compare=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
  const nodes=graph.nodes.toSorted((a,b)=>rank==="degree"
    ? b.edges.size-a.edges.size || b.frequency-a.frequency || compare(a,b)
    : b.frequency-a.frequency || b.weight-a.weight || b.edges.size-a.edges.size || compare(a,b));
  for (const node of nodes) {
    const used=new Set([...node.edges].map(other=>other.color));
    let color=0;
    while (used.has(color)) color++;
    if (color>=255) return;
    node.color=color;
  }
  return graph.states.map(row=>{
    const mapping=[];
    for (const {node,rule} of row) mapping[rule]=node.color;
    return mapping;
  });
}

function* ruleCandidates(grammar) {
  const data=tables(grammar);
  if (!data) return;
  const infos=rules(grammar,data);
  if (infos.some(list=>list.some(item=>item.rule===255))) return;
  yield ["compact",localRules(infos,(a,b)=>a.rule-b.rule)];
  yield ["usage",localRules(infos,(a,b)=>b.usage-a.usage || a.rule-b.rule)];
  yield ["first-character",localRules(infos,(a,b)=>a.first-b.first || a.rule-b.rule)];
  for (const kind of ["selector","action"]) {
    const graph=ruleGraph(grammar,data,infos,kind);
    for (const rank of ["frequency","degree"]) {
      const mapping=colorRules(graph,rank);
      if (mapping) yield [`${kind}-${rank}`,mapping];
    }
  }
}

export function optimizeGrammar(value, encode, options={}) {
  const pooled=Array.isArray(value);
  let grammars=pooled?value:[value];
  const score=values=>{
    const buffer=encode(pooled?values:values[0]);
    return {buffer,gzip:gzipSync(buffer.toString("base64"),{level:9}).length};
  };
  let best=score(grammars);
  const beforeBytes=best.buffer.length,steps=[];
  function* changes(grammar, includeRules) {
    if (options.states!==false)
      for (const [strategy,order] of stateCandidates(grammar)) yield [`states/${strategy}`,reorderStates(grammar,order)];
    if (includeRules)
      for (const [strategy,mapping] of ruleCandidates(grammar)) yield [`rules/${strategy}`,reorderRules(grammar,mapping)];
  }
  function improve(includeRules, passes) {
    for (let pass=0;pass<passes;pass++) {
      let changed=false;
      for (let index=0;index<grammars.length;index++) {
        let selected;
        const beforeTableBytes=best.buffer.length;
        for (const [strategy,grammar] of changes(grammars[index],includeRules)) {
          const values=grammars.slice();
          values[index]=grammar;
          const candidate=score(values);
          if (candidate.buffer.length<=best.buffer.length && candidate.gzip<=best.gzip &&
              (candidate.buffer.length<best.buffer.length || candidate.gzip<best.gzip)) {
            selected={values,strategy};
            best=candidate;
          }
        }
        if (selected) {
          grammars=selected.values;
          steps.push({phase:includeRules?"rules":"states",pass,index,strategy:selected.strategy,beforeBytes:beforeTableBytes,afterBytes:best.buffer.length});
          changed=true;
        }
      }
      if (!changed) break;
    }
  }
  function improveBatch() {
    const base=grammars;
    const choices=base.map(grammar=>new Map(ruleCandidates(grammar)));
    const names=new Set(choices.flatMap(choice=>[...choice.keys()]));
    const beforeTableBytes=best.buffer.length;
    let selected;
    for (const strategy of names) {
      const values=base.map((grammar,index)=>{
        const mapping=choices[index].get(strategy);
        return mapping?reorderRules(grammar,mapping):grammar;
      });
      const candidate=score(values);
      if (candidate.buffer.length<=best.buffer.length && candidate.gzip<=best.gzip &&
          (candidate.buffer.length<best.buffer.length || candidate.gzip<best.gzip)) {
        selected={values,strategy};
        best=candidate;
      }
    }
    if (selected) {
      grammars=selected.values;
      steps.push({phase:"rules",index:null,strategy:`rules/batch/${selected.strategy}`,beforeBytes:beforeTableBytes,afterBytes:best.buffer.length});
    }
  }
  if (options.states!==false) improve(false,2);
  if (options.rules!==false) {improveBatch();improve(true,3);}
  return {value:pooled?grammars:grammars[0],buffer:best.buffer,beforeBytes,steps};
}

export function optimizeNearbyStates(value, encode) {
  const pooled=Array.isArray(value);
  if(pooled)return {value,buffer:encode(value),steps:[]};
  let grammars=pooled?value:[value];
  const score=values=>{
    const buffer=encode(pooled?values:values[0]);
    return {buffer,gzip:gzipSync(buffer.toString("base64"),{level:9}).length};
  };
  let best=score(grammars);
  const steps=[];
  for(let pass=0;pass<4;pass++) {
    let changed=false;
    for(let index=0;index<grammars.length;index++) {
      const data=tables(grammars[index]);
      const states=data?.probe_mask.length;
      if(!states||states>96)continue;
      for(const distance of [1,2,4])for(let first=1;first+distance<states;first++) {
        const second=first+distance;
        const order=Array.from({length:states},(_,state)=>state);
        [order[first],order[second]]=[order[second],order[first]];
        const values=grammars.slice();
        values[index]=reorderStates(grammars[index],order);
        const candidate=score(values);
        if(candidate.buffer.length<=best.buffer.length&&candidate.gzip<=best.gzip&&
            (candidate.buffer.length<best.buffer.length||candidate.gzip<best.gzip)) {
          steps.push({phase:"nearby-states",pass,index,first,second,beforeBytes:best.buffer.length,afterBytes:candidate.buffer.length});
          grammars=values;
          best=candidate;
          changed=true;
        }
      }
    }
    if(!changed)break;
  }
  return {value:pooled?grammars:grammars[0],buffer:best.buffer,steps};
}
