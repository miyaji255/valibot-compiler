import * as v from "valibot";

export const UserId = v.pipe(v.string(), v.uuid(), v.brand("UserId"));

export const CommentId = v.pipe(v.string(), v.uuid(), v.brand("CommentId"));

export const ArticleId = v.pipe(v.string(), v.uuid(), v.brand("ArticleId"));

export const User = v.object({
  userId: UserId,
  username: v.string("required username"),
  age: v.pipe(v.number(), v.integer(), v.minValue(0)),
  sex: v.picklist(["male", "female", "other"]),
  description: v.pipe(v.string(), v.maxLength(1000)),
});

export const Comment = v.object({
  commentId: CommentId,
  articleId: ArticleId,
  authorId: UserId,
  content: v.pipe(v.string(), v.maxLength(500)),
});

export const Article = v.pipe(
  v.object({
    articleId: ArticleId,
    title: v.string("required title"),
    content: v.string("required content"),
    authorId: UserId,
    author: User,
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
