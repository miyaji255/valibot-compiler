import * as v from 'valibot';
import { object, pipe, string, number, integer, minValue, nanoid } from 'valibot';

const User = object({
  userId: pipe(string(), nanoid()),
  username: string(),
  age: pipe(number(), integer(), minValue(0)),
});

const Blog = v.object({
  id: v.pipe(v.string(), v.nanoid()),
  title: v.string(),
  content: v.string(),
  author: User,
});

export { Blog };
