import * as v from "valibot";
import { User } from "./User.ts";

export const Comment = v.object({
  id: v.pipe(v.string(), v.nanoid()),
  blogId: v.string(),
  content: v.string(),
  author: User,
});

export const Blog = v.object({
  id: v.pipe(v.string(), v.nanoid()),
  title: v.string(),
  content: v.string(),
  author: User,
  keywords: v.array(v.string()),
  comments: v.array(Comment),
});
