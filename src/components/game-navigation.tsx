"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { useGameRefresh } from "@/components/game-refresh";
import { ContentLoading } from "@/components/content-loading";

type Destination = { id: string; href: string };
type NavigationControl = {
  destination: Destination | null;
  start: (destination: Destination) => void;
  finish: (id: string) => void;
};
const NavigationContext = createContext<NavigationControl | null>(null);

export function GameNavigationProvider({ children }: { children: ReactNode }) {
  const [destination, setDestination] = useState<Destination | null>(null);
  const start = useCallback((next: Destination) => setDestination(next), []);
  const finish = useCallback((id: string) => {
    setDestination(current => current?.id === id ? null : current);
  }, []);
  const control = useMemo(() => ({ destination, start, finish }), [destination, start, finish]);
  return <NavigationContext value={control}>{children}</NavigationContext>;
}

function LinkActivity({ href, start, finish }: { href: string } & Pick<NavigationControl, "start" | "finish">) {
  const { pending } = useLinkStatus();
  const { hold } = useGameRefresh();
  const id = useId();
  useLayoutEffect(() => {
    if (!pending) return;
    const release = hold();
    start({ id, href });
    return () => {
      finish(id);
      release();
    };
  }, [pending, hold, id, href, start, finish]);
  return null;
}

export function GameLink({ children, href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const control = useContext(NavigationContext);
  return <Link {...props} href={href}>
    {children}
    {control && <LinkActivity href={href} start={control.start} finish={control.finish} />}
  </Link>;
}

export function useNavigationPathname() {
  const pathname = usePathname();
  const control = useContext(NavigationContext);
  return control?.destination?.href.split(/[?#]/)[0] || pathname;
}

export function GameContent({ children }: { children: ReactNode }) {
  const control = useContext(NavigationContext);
  const pending = Boolean(control?.destination);
  return <div aria-busy={pending}>
    {pending && <ContentLoading />}
    {/* Keep in-flight actions and drafts mounted until the router commits. */}
    <div hidden={pending} inert={pending}>{children}</div>
  </div>;
}
