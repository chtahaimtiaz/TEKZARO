import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getAllAuthors } from "@/lib/articles";

// SEO metadata for the About page
export const metadata: Metadata = {
  title: "About – TEKZARO",
  description: "Learn about TEKZARO – Pakistan‑first technology journalism with global coverage and in‑depth reporting.",
  alternates: { canonical: "/about" },
};

/**
 * About page – server component
 * Fetches author data at build time and renders a rich, SEO‑friendly description of the publication.
 */
export default async function AboutPage() {
  const authors = await getAllAuthors();

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      {/* Header */}
      <section className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">
          About <span className="text-blue-600">TEKZARO</span>
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
          Independent, fact‑checked technology journalism – Pakistan‑first, globally informed.
        </p>
      </section>

      {/* Mission & Vision */}
      <section className="space-y-8 text-gray-700 dark:text-gray-300">
        <div>
          <h2 className="text-2xl font-bold mb-3">Our Mission</h2>
          <p>
            To empower readers in Pakistan and South Asia with high‑quality, evidence‑based tech news that puts the region at the centre of the global conversation. We cover AI, smartphones, cybersecurity, startups, space, and more – always prioritising stories that directly impact Pakistani developers, businesses and consumers.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-3">Editorial Standards</h2>
          <p>
            Every article is written by experienced journalists, fact‑checked, and vetted against a strict evidentiary checklist. We avoid thin, auto‑generated content and only publish pieces that provide genuine insight or actionable information.
          </p>
        </div>
      </section>

      {/* Author showcase – adds unique, author‑generated content */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold mb-4">Meet Our Authors</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {authors.map((author) => (
            <article key={author.id} className="flex items-start space-x-4">
              {author.avatar && (
                <Image
                  src={author.avatar}
                  alt={author.name}
                  width={64}
                  height={64}
                  className="rounded-full"
                />
              )}
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {author.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {author.bio}
                </p>
                <Link href={`/authors/${author.slug}`}>Read more →</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Call to action */}
      <footer className="mt-12 text-center border-t border-gray-200 pt-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Have questions or want to collaborate? <Link href="/contact" className="text-blue-600 hover:underline">Contact us</Link>.
        </p>
      </footer>
    </main>
  );
}
