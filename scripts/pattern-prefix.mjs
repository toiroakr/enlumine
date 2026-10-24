import {gzipSync} from "node:zlib";

export function patternPrefix(value,prefix) {
  const replace=grammar=>!grammar?.char_maps?.$||!grammar.transitions?.$||!Array.isArray(grammar.patterns_by_state)?grammar:({...grammar,patterns_by_state:grammar.patterns_by_state.map(state=>
    state?.map(bucket=>bucket?.map(pattern=>typeof pattern.codes==="string"&&pattern.codes.length
      ? {...pattern,codes:prefix+pattern.codes.slice(1)}:pattern)??null)??null)});
  return Array.isArray(value)?value.map(replace):replace(value);
}

export function optimizePatternPrefixes(value,buffer,encode) {
  const score=buffer=>gzipSync(buffer.toString("base64"),{level:9}).length;
  let best={value,buffer},gzip=score(buffer),prefix;
  for(const candidate of ["a"," ","_","t","\0"]) {
    const changed=patternPrefix(value,candidate),compressed=encode(changed),size=score(compressed);
    if(compressed.length<=best.buffer.length&&size<=gzip&&
        (compressed.length<best.buffer.length||size<gzip)) {
      best={value:changed,buffer:compressed};gzip=size;prefix=candidate;
    }
  }
  return {...best,prefix};
}
