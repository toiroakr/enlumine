export function packGrammar(value) {
  if (ArrayBuffer.isView(value)) {
    const runs = [];
    for (let i = 0; i < value.length;) {
      let end = i + 1;
      while (end < value.length && value[end] === value[i]) end++;
      runs.push(end - i, value.BYTES_PER_ELEMENT === 2 && value[i] > 32767 ? value[i] - 65536 : value[i]);
      i = end;
    }
    return { $: [value.BYTES_PER_ELEMENT * 8, runs] };
  }
  if (value instanceof Map)
    return { $: [0, [...value].map(packGrammar)] };
  if (Array.isArray(value)) return Array.from(value, packGrammar);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "codes" && ArrayBuffer.isView(item)
          ? Array.from(item, (code) => String.fromCharCode(code)).join("")
          : packGrammar(item),
      ]),
    );
  return value;
}
