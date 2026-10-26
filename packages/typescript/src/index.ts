import { execute } from "@enlumine/core";
import type { Tokenizer } from "@enlumine/core";
import { typescript } from "enlumine:typescript-grammar";
import { pipeline } from "./pipeline.js";
import { reclassify } from "./run.js";

const classify = reclassify(pipeline);
const tokenize: Tokenizer = source => classify(source, execute(source, typescript));
export default tokenize;
