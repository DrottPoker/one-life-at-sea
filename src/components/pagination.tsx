import { GameLink as Link } from "@/components/game-navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

// The first, last, current and neighbouring pages, in order and without repeats.
export function pageWindow(page: number, pages: number) {
  return Array.from(new Set([0, page - 1, page, page + 1, pages - 1])).filter(value => value >= 0 && value < pages).sort((a, b) => a - b);
}

// Pages are zero-based here; each caller decides how its URLs number them.
export function Pagination({ page, pages, href, label, scroll = true }: { page: number; pages: number; href: (page: number) => string; label: string; scroll?: boolean }) {
  const numbers = pageWindow(page, pages);
  return <nav className="o-pagination" aria-label={label}>
    {page > 0 && <Link href={href(page - 1)} aria-label="Previous page" scroll={scroll}><ChevronLeft size={16} aria-hidden="true" /></Link>}
    {numbers.map((value, index) => <span key={value}>{index > 0 && value > numbers[index - 1] + 1 && <span className="o-pagination-gap">…</span>}
      <Link href={href(value)} scroll={scroll} aria-label={"Page " + (value + 1)} aria-current={value === page ? "page" : undefined}>{value + 1}</Link></span>)}
    {page + 1 < pages && <Link href={href(page + 1)} aria-label="Next page" scroll={scroll}><ChevronRight size={16} aria-hidden="true" /></Link>}
  </nav>;
}
