import { execute } from "@enlumine/core";
import type { Grammar, Tokenizer } from "@enlumine/core";
import { reclassify } from "@twinkleplop/core";
import { grammar, reclassifiers } from "@twinkleplop/typescript";

const classify = reclassify(reclassifiers.map(item => typeof item === "function" ? item : item.reclassifier));
const tokenize: Tokenizer = source => classify(source, execute(source, grammar as Grammar));
export default tokenize;
