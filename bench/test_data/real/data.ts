const authorId = crypto.randomUUID();
const articleId = crypto.randomUUID();
const now = new Date().toISOString();

export const valid = {
  articleId,
  slug: "how-to-ship-valibot-rules",
  title: "How We Ship Valibot Schemas Safely",
  summary:
    "Lessons learned from hardening valibot schemas for production services and design systems.",
  content: Array(12)
    .fill(
      "We migrated our validation layer to valibot to simplify contracts between services and frontends. " +
        "The compiler removes runtime cost while keeping strong typing across packages. " +
        "This article documents real-world pitfalls like inconsistent string casing, phone number drift, " +
        "and the need for predictable slugs.",
    )
    .join(" "),
  authorId,
  author: {
    userId: authorId,
    username: "valibot_dev",
    displayName: "Valibot Developer",
    email: "dev@example.com",
    phone: "+1-415-555-1234",
    bio: "Builds validation tooling and DX improvements.",
    website: "https://example.com",
    locale: "en",
    roles: ["author", "moderator"],
    createdAt: now,
  },
  tags: ["valibot", "compiler", "validation", "typescript"],
  keywords: ["runtime validation", "ESM", "DX", "schema"],
  heroImageUrl: "https://example.com/hero.jpg",
  category: "engineering",
  status: "published",
  updatedAt: now,
  comments: Array.from({ length: 3 }, (_, j) => ({
    commentId: crypto.randomUUID(),
    articleId,
    authorId: crypto.randomUUID(),
    content: `I tried this approach in my service and it worked great (comment ${j}).`,
    language: "en",
    createdAt: now,
  })),
};
