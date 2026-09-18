"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CategoryBar } from "@/components/CategoryBar";
import { Nav } from "@/components/Nav";

/**
 * The museum ("/") owns the whole viewport.
 *
 * It gets a full-bleed <main> and none of the site chrome — no nav, no
 * category bar. A navigation bar floating over a 3D scene breaks the
 * illusion of standing somewhere more than any material or light ever
 * could, because it is the one element that is unmistakably a web page.
 * The only way out of the hall is the "Skip 3D" link the scene itself
 * carries, which leads to the ordinary site where the nav lives.
 */
export function ContentFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isMuseum = pathname === "/";

  return (
    <>
      {isMuseum ? null : <Nav />}
      <main className={isMuseum ? "museum-main" : "content-area"}>{children}</main>
      {isMuseum ? null : <CategoryBar />}
    </>
  );
}
