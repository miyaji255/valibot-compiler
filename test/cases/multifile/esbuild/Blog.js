// test/cases/multifile/Blog.ts
import "valibot";

// test/cases/multifile/User.ts
import "valibot";

// unplugin-valibot-compiler:valibot-compiler:cache/String__b9a25456
import { string } from "valibot";
var String_b9a25456_default = string();

// unplugin-valibot-compiler:valibot-compiler:cache/Nanoid__7a0de2d7
import { nanoid } from "valibot";
var Nanoid_7a0de2d7_default = nanoid();

// unplugin-valibot-compiler:valibot-compiler:cache/Pipe__3d2225c4
import { pipe } from "valibot";
var Pipe_3d2225c4_default = pipe(String_b9a25456_default, Nanoid_7a0de2d7_default);

// unplugin-valibot-compiler:valibot-compiler:cache/String__599e5f4e
import { string as string2 } from "valibot";
var String_599e5f4e_default = string2("required username");

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
import { pipe as pipe2 } from "valibot";
var Pipe_28ae05ea_default = pipe2(Number_c7ca7cc6_default, Integer_79a8dcf4_default, MinValue_aa09d8de_default);

// unplugin-valibot-compiler:valibot-compiler:cache/Object__cef94e3e
import { object } from "valibot";
var Object_cef94e3e_default = object({ userId: Pipe_3d2225c4_default, username: String_599e5f4e_default, age: Pipe_28ae05ea_default });

// unplugin-valibot-compiler:valibot-compiler:cache/Object__39b6b332
import { object as object3 } from "valibot";

// unplugin-valibot-compiler:/home/snow/workspace/valibot-compiler/test/cases/multifile/User.ts
var User = Object_cef94e3e_default;

// unplugin-valibot-compiler:valibot-compiler:cache/Object__39b6b332
var Object_39b6b332_default = object3({ id: Pipe_3d2225c4_default, blogId: String_b9a25456_default, content: String_b9a25456_default, author: User });

// unplugin-valibot-compiler:valibot-compiler:cache/Array__0d3f089c
import { array } from "valibot";
var Array_0d3f089c_default = array(String_b9a25456_default);

// unplugin-valibot-compiler:valibot-compiler:cache/Array__2b5dcfc9
import { array as array2 } from "valibot";
var Array_2b5dcfc9_default = array2(Object_39b6b332_default);

// unplugin-valibot-compiler:valibot-compiler:cache/Object__55542a5d
import { object as object4 } from "valibot";
var Object_55542a5d_default = object4({ id: Pipe_3d2225c4_default, title: String_b9a25456_default, content: String_b9a25456_default, author: User, keywords: Array_0d3f089c_default, comments: Array_2b5dcfc9_default });

// test/cases/multifile/Blog.ts
var Comment = Object_39b6b332_default;
var Blog = Object_55542a5d_default;
export {
  Blog,
  Comment
};
