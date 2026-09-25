import type { ReactNode } from "react";
import { MessagesSquare } from "lucide-react";
import { requireCharacter } from "@/lib/player";

export const metadata = { title: "Forums" };

export default async function ForumsLayout({ children }: { children: ReactNode }) {
  await requireCharacter({ allowHospital: true, allowSea: true });
  return <section className="o-panel o-forum-panel">
    <header className="o-forum-heading"><MessagesSquare aria-hidden="true" />
      <div><h1>Forums</h1><p>Discuss the game with captains from every harbor.</p></div>
    </header>
    {children}
  </section>;
}
