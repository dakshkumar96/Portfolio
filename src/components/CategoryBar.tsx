"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { categories } from "@/content/site";

export function CategoryBar() {
  const pathname = usePathname();

  return (
    <nav className="category-bar" aria-label="work categories">
      {categories.map((category) => (
        <Link
          key={category.slug}
          href={`/${category.slug}`}
          className={pathname === `/${category.slug}` ? "active" : ""}
        >
          {category.label}
        </Link>
      ))}
    </nav>
  );
}
