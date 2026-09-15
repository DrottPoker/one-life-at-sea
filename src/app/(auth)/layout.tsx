import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main id="main" className="o-public-space">{children}</main>;
}
