const authorId = crypto.randomUUID();
const articleId = crypto.randomUUID();
export const valid = {
  articleId,
  title: `Article Title`,
  content: `This is the content of article.`,
  authorId,
  author: {
    userId: authorId,
    username: `user`,
    age: Math.floor(Math.random() * 100),
    sex: "other",
    description: `This is a description for user.`,
  },
  comments: Array.from({ length: Math.floor(Math.random() * 50) }, (_, j) => ({
    commentId: crypto.randomUUID(),
    articleId,
    authorId: crypto.randomUUID(),
    content: `This is comment ${j} on article .`,
  })),
};
