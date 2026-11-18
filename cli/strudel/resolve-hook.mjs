/* cannoli — two of Strudel's dependencies point Node at builds it can't import by name. */
export async function resolve(specifier, context, next) {
  if (specifier === "@kabelsalat/web") return next("@kabelsalat/web/dist/index.mjs", context);
  if (specifier === "soundfont2" && !context.parentURL?.endsWith("soundfont2-shim.mjs")) {
    return next(new URL("./soundfont2-shim.mjs", import.meta.url).href, context);
  }
  return next(specifier, context);
}
