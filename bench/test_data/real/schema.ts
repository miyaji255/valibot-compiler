import * as v from "valibot";

export const UserId = v.pipe(v.string(), v.uuid(), v.brand("UserId"));

export const CommentId = v.pipe(v.string(), v.uuid(), v.brand("CommentId"));

export const ArticleId = v.pipe(v.string(), v.uuid(), v.brand("ArticleId"));

export const User = v.object({
  userId: UserId,
  username: v.pipe(v.string(), v.minLength(3), v.maxLength(30)),
  displayName: v.pipe(v.string(), v.minLength(1), v.maxLength(60)),
  email: v.pipe(v.string(), v.email()),
  phone: v.pipe(v.string(), v.regex(/^\+?[0-9\- ]{7,20}$/)),
  bio: v.optional(v.pipe(v.string(), v.maxLength(280))),
  website: v.optional(v.pipe(v.string(), v.url())),
  locale: v.picklist(["en", "ja", "es", "fr", "de"]),
  roles: v.pipe(
    v.array(v.picklist(["reader", "author", "moderator"])),
    v.minLength(1),
    v.maxLength(5),
  ),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
});

export const Comment = v.object({
  commentId: CommentId,
  articleId: ArticleId,
  authorId: UserId,
  content: v.pipe(v.string(), v.minLength(1), v.maxLength(1000)),
  language: v.picklist(["en", "ja", "es", "fr", "de"]),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
});

export const Article = v.pipe(
  v.object({
    articleId: ArticleId,
    slug: v.pipe(v.string(), v.regex(/^[a-z0-9-]{8,80}$/)),
    title: v.pipe(v.string(), v.minLength(10), v.maxLength(120)),
    summary: v.pipe(v.string(), v.minLength(20), v.maxLength(240)),
    content: v.pipe(v.string(), v.minLength(200), v.maxLength(10000)),
    authorId: UserId,
    author: User,
    tags: v.pipe(
      v.array(v.pipe(v.string(), v.minLength(2), v.maxLength(20))),
      v.minLength(1),
      v.maxLength(15),
    ),
    keywords: v.optional(
      v.pipe(
        v.array(v.pipe(v.string(), v.minLength(2), v.maxLength(20))),
        v.maxLength(25),
      ),
    ),
    heroImageUrl: v.optional(v.pipe(v.string(), v.url())),
    category: v.picklist(["engineering", "design", "product", "research"]),
    status: v.picklist(["draft", "review", "published"]),
    updatedAt: v.pipe(v.string(), v.isoTimestamp()),
    comments: v.array(Comment),
  }),
  v.forward(
    v.check(
      (article) => article.authorId === article.author.userId,
      "authorId must match the userId of author",
    ),
    ["authorId"],
  ),
  v.forward(
    v.check(
      (article) =>
        article.comments.every(
          (comment) => comment.articleId === article.articleId,
        ),
      "All comments must belong to the article",
    ),
    ["comments"],
  ),
);
export default Article;
