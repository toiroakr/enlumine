import {brotliCompressSync,constants,gzipSync} from "node:zlib";

export function tuneGrammar(value, baseline, serialize=JSON.stringify) {
  const source=Buffer.from(serialize(value));
  const score=buffer=>gzipSync(buffer.toString("base64"),{level:9}).length;
  let buffer=baseline,gzip=score(baseline),parameters;
  for(const mode of [constants.BROTLI_MODE_GENERIC,constants.BROTLI_MODE_FONT])
    for(const window of [10,12,14,15,16,18,20,22,23,24]) {
      const candidate=brotliCompressSync(source,{params:{
        [constants.BROTLI_PARAM_QUALITY]:11,
        [constants.BROTLI_PARAM_MODE]:mode,
        [constants.BROTLI_PARAM_LGWIN]:window,
      }});
      const candidateGzip=score(candidate);
      if(candidate.length<=buffer.length&&candidateGzip<=gzip&&
          (candidate.length<buffer.length||candidateGzip<gzip)) {
        buffer=candidate;
        gzip=candidateGzip;
        parameters={quality:11,mode,window};
      }
    }
  return {buffer,parameters};
}
