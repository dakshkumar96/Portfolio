"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { StarLogo } from "./StarLogo";

const links = [
  // the ordinary site's home; the star in the middle goes back into the 3D museum
  { href: "/profile", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/resume", label: "Resume" },
  { href: "/contact", label: "Contact" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="top-nav">
      <nav>
        {links.slice(0, 2).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link${pathname === link.href ? " active" : ""}`}
          >
            {link.label}
          </Link>
        ))}
        <Link href="/" className="nav-logo" aria-label="Enter the 3D museum" title="Enter the 3D museum">
          <StarLogo />
        </Link>
        {links.slice(2).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-link${pathname === link.href ? " active" : ""}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
