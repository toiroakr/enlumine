import type { SqlStyles } from "../editor.js";

const styles: SqlStyles = Object.freeze({
  keyword: "\x1b[34m", boolean: "\x1b[34m", type: "\x1b[34m",
  function: "\x1b[35m", identifier: "\x1b[33m", variable: "\x1b[33m",
  string: "\x1b[92m", string_escape: "\x1b[92m", bit: "\x1b[92m",
  number: "\x1b[36m", operator: "\x1b[90m", comment: "\x1b[90m",
  punctuation: "\x1b[90m", special: "\x1b[90m", bracket: "\x1b[2;33m",
});

export default styles;
