import { string, nanoid, pipe, number, integer, minValue, object, array } from 'valibot';

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

var Object__39b6b332 = object({ id: Pipe__3d2225c4, blogId: String__b9a25456, content: String__b9a25456, author: User });

var Array__0d3f089c = array(String__b9a25456);

var Array__2b5dcfc9 = array(Object__39b6b332);

var Object__55542a5d = object({ id: Pipe__3d2225c4, title: String__b9a25456, content: String__b9a25456, author: User, keywords: Array__0d3f089c, comments: Array__2b5dcfc9 });

const Comment = Object__39b6b332;

const Blog = Object__55542a5d;

export { Blog, Comment };
