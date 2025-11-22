import * as v from "valibot";

export default v.object({
  one: v.array(
    v.pipe(
      v.object({
        items: v.array(
          v.object({
            val: v.optional(v.union([v.literal("hello"), v.literal("world")])),
            str: v.pipe(
              v.string(),
              v.minLength(2),
              v.maxLength(5),
              v.transform((a) => `${a}_APPENDED`),
            ),
            num: v.pipe(
              v.number(),
              v.minValue(100),
              v.maxValue(200),
              v.transform(String),
            ),
          }),
        ),
      }),
      v.transform((o) => ["FIRST", ...o.items]),
    ),
  ),
});
