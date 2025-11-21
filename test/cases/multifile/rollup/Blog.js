import * as v from 'valibot';
import { string, nanoid, pipe, number, integer, minValue, object } from 'valibot';

var String__b9a25456 = string();

var Nanoid__7a0de2d7 = nanoid();

var Pipe__3d2225c4 = pipe(String__b9a25456, Nanoid__7a0de2d7);

var String__599e5f4e = string("required username");

var Number__c7ca7cc6 = number();

var Integer__79a8dcf4 = integer();

var MinValue__aa09d8de = minValue(0);

var Pipe__28ae05ea = pipe(Number__c7ca7cc6, Integer__79a8dcf4, MinValue__aa09d8de);

var Object__cef94e3e = object({ userId: Pipe__3d2225c4, username: String__599e5f4e, age: Pipe__28ae05ea });

const User = Object__cef94e3e;

const Blog = v.object({
  id: Pipe__3d2225c4,
  title: String__b9a25456,
  content: String__b9a25456,
  author: User,
});

export { Blog };
