import Image from "next/image";
import { portraitFor } from "@/lib/portraits";

// Portraits are 3:4 artwork; the frame keeps that ratio and crops anything else.
export function CaptainPortrait({ portraitId, sizes, eager = false }: { portraitId: string | null | undefined; sizes: string; eager?: boolean }) {
  return <span className="o-portrait-art"><Image src={portraitFor(portraitId).image} alt="" fill sizes={sizes} loading={eager ? "eager" : "lazy"} /></span>;
}
