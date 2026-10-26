declare module "enlumine:typescript-grammar" {
  import type { Grammar } from "@enlumine/core";
  export const typescript: Grammar;
  export const javascript: Grammar;
  export const html: Grammar;
  export const css: Grammar;
  export const jsdoc: Grammar;
}

declare module "enlumine:typescript-frames" {
  export const typescriptFrames: any;
  export const javascriptFrames: any;
}
