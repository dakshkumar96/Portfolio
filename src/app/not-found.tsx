import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-hero" style={{ paddingTop: 80 }}>
      <h1 className="serif" style={{ fontSize: 64 }}>
        404
      </h1>
      <p className="contact-copy">This page wandered off. So did I, once.</p>
      <p style={{ marginTop: 20 }}>
        <Link href="/" className="tag">
          Back Home
        </Link>
      </p>
    </section>
  );
}
