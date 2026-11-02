import Link from "next/link";

type SectionCardProps = { href: string; title: string; description: string };

export function SectionCard({ href, title, description }: SectionCardProps) {
  return (
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-navy/10">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2">{description}</p>
      <p className="mt-3">
        <Link href={href}>Go to {title.toLowerCase()} →</Link>
      </p>
    </section>
  );
}
