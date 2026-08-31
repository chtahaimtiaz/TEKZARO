import type { Article, Author, Category, Tag, ArticleTag, ArticleSource, Source } from "@prisma/client";

export type ArticleTagWithTag = ArticleTag & { tag: Tag };
export type ArticleSourceWithSource = ArticleSource & { source: Source };

export type ArticleWithRelations = Article & {
  category: Category;
  author: Author;
  tags: ArticleTagWithTag[];
  sources: ArticleSourceWithSource[];
};
