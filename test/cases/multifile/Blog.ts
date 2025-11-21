import * as v from "valibot";
import { User } from "./User";

export const Blog = v.object({
  id: v.pipe(v.string(), v.nanoid()),
  title: v.string(),
  content: v.string(),
  author: User,
});
