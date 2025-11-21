import {
  string,
  number,
  object,
  pipe,
  integer,
  minValue,
  nanoid,
} from "valibot";

export const User = object({
  userId: pipe(string(), nanoid()),
  username: string(),
  age: pipe(number(), integer(), minValue(0)),
});
