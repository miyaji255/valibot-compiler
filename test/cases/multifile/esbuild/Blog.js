// test/cases/multifile/Blog.ts
import * as v from "valibot";

// test/cases/multifile/User.ts
import {
  string,
  number,
  object,
  pipe,
  integer,
  minValue,
  nanoid
} from "valibot";
var User = object({
  userId: pipe(string(), nanoid()),
  username: string(),
  age: pipe(number(), integer(), minValue(0))
});

// test/cases/multifile/Blog.ts
var Blog = v.object({
  id: v.pipe(v.string(), v.nanoid()),
  title: v.string(),
  content: v.string(),
  author: User
});
export {
  Blog
};
