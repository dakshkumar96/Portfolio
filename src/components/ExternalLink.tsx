import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { site } from "@/content/site";

/*
  Links that leave the site open in a new tab; everything else stays in
  this one.

  The museum is one page with the 3D hall in it, so a link that went
  elsewhere in the same tab threw the visitor out of the hall, and a
  room-to-room link opened in a new tab would start a second copy of it.
  So the rule is by where a link goes, not by where it is drawn: another
  host opens in a new tab, and this site, mailto: and tel: stay put.
*/

/** The site's own host. A link to anywhere else leaves the site. */
const HOME = new URL(site.url).hostname.replace(/^www\./, "");

/** True for a full web address on another host. Paths on this site, mailto: and tel: are not external. */
export function isExternal(href: string) {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return new URL(href).hostname.replace(/^www\./, "") !== HOME;
  } catch {
    return false;
  }
}

const NOTE = " (opens in a new tab)";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel"> & {
  href: string;
  children: ReactNode;
};

/**
 * A link that leaves the site: a new tab, with no way back into this page
 * (noopener) and no referrer (noreferrer), and a screen reader is told it
 * opens a new tab. An icon-only link carries its name in aria-label, which
 * replaces its content when read, so there the note joins the label.
 */
export function ExternalLink({ children, "aria-label": label, ...rest }: LinkProps) {
  return (
    <a {...rest} aria-label={label ? `${label}${NOTE}` : undefined} target="_blank" rel="noopener noreferrer">
      {children}
      {label ? null : <span className="sr-only">{NOTE}</span>}
    </a>
  );
}

/** A link from the content, wherever it points: decided by its address. */
export function SiteLink({ href, children, ...rest }: LinkProps) {
  if (isExternal(href)) {
    return (
      <ExternalLink href={href} {...rest}>
        {children}
      </ExternalLink>
    );
  }
  if (/^(mailto|tel):/i.test(href)) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  );
}
