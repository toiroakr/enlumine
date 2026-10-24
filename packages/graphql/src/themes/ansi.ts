import type { GraphqlStyles } from "../editor.js";

const styles: GraphqlStyles = Object.freeze({
  keyword: "\x1b[34m", definition: "\x1b[1;36m", property: "\x1b[94m",
  parameter: "\x1b[3;33m", type: "\x1b[36m", variable: "\x1b[35m",
  decorator: "\x1b[1;35m", number: "\x1b[34m", string: "\x1b[32m",
  comment: "\x1b[90m", punctuation: "\x1b[90m", bracket: "\x1b[2;33m", brace: "\x1b[33m",
});

export default styles;
