// test/cases/multifile/Blog.ts
import * as v from "valibot";

// unplugin-valibot-compiler:valibot-compiler:cache/Object__cef94e3e
import { object } from "valibot";

// unplugin-valibot-compiler:valibot-compiler:cache/Pipe__3d2225c4
import { pipe } from "valibot";

// unplugin-valibot-compiler:valibot-compiler:cache/String__b9a25456
import { string } from "valibot";
var String_b9a25456_default = string();

// unplugin-valibot-compiler:valibot-compiler:cache/Nanoid__7a0de2d7
import { nanoid } from "valibot";
var Nanoid_7a0de2d7_default = nanoid();

// unplugin-valibot-compiler:valibot-compiler:cache/Pipe__3d2225c4
var Pipe_3d2225c4_default = pipe(String_b9a25456_default, Nanoid_7a0de2d7_default);

// unplugin-valibot-compiler:valibot-compiler:cache/String__599e5f4e
import { string as string2 } from "valibot";
var String_599e5f4e_default = string2("required username");

// unplugin-valibot-compiler:valibot-compiler:cache/Pipe__28ae05ea
import { pipe as pipe2 } from "valibot";

// unplugin-valibot-compiler:valibot-compiler:cache/Number__c7ca7cc6
import { number } from "valibot";
var Number_c7ca7cc6_default = number();

// unplugin-valibot-compiler:valibot-compiler:cache/Integer__79a8dcf4
import { integer } from "valibot";
var Integer_79a8dcf4_default = integer();

// unplugin-valibot-compiler:valibot-compiler:cache/MinValue__aa09d8de
import { minValue } from "valibot";
var MinValue_aa09d8de_default = minValue(0);

// unplugin-valibot-compiler:valibot-compiler:cache/Pipe__28ae05ea
var Pipe_28ae05ea_default = pipe2(Number_c7ca7cc6_default, Integer_79a8dcf4_default, MinValue_aa09d8de_default);

// unplugin-valibot-compiler:valibot-compiler:cache/Object__cef94e3e
var Object_cef94e3e_default = object({ userId: Pipe_3d2225c4_default, username: String_599e5f4e_default, age: Pipe_28ae05ea_default });

// test/cases/multifile/User.ts
var User = Object_cef94e3e_default;

// test/cases/multifile/Blog.ts
var Blog = v.object({
  id: Pipe_3d2225c4_default,
  title: String_b9a25456_default,
  content: String_b9a25456_default,
  author: User
});
export {
  Blog
};
