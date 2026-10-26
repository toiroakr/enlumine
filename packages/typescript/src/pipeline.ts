import { typescriptFrames } from "enlumine:typescript-frames";
import { trackFrames } from "./frames.js";
import { functionBindings } from "./bindings.js";
import { classNames, constBindings, constants, enums, namespaces } from "./claims.js";
import { embed } from "./languages.js";
import { parameters } from "./params.js";
import { properties } from "./property.js";
import { reservedNames } from "./rules.js";
import { genericCalls, genericShapes, typeKeywords } from "./passes.js";
import { typeRewrites } from "./types.js";

export const pipeline = [
	trackFrames(typescriptFrames),
	reservedNames,
	constants,
	namespaces,
	functionBindings,
	constBindings,
	properties,
	typeRewrites,
	typeKeywords,
	genericCalls,
	classNames,
	enums,
	parameters,
	genericShapes,
	embed,
];
