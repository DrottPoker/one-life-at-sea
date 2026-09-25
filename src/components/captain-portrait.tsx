import Image from "next/image";

// Every captain shares the owner's default portrait until players can choose their own.
const DEFAULT_PORTRAIT = { src: "/images/portraits/captain-default.webp", width: 1086, height: 1448 };
export const PROFILE_HEADER = "/images/headers/profile-harbor-dusk.webp";

export function CaptainPortrait({ sizes }: { sizes: string }) {
  return <Image src={DEFAULT_PORTRAIT.src} width={DEFAULT_PORTRAIT.width} height={DEFAULT_PORTRAIT.height} sizes={sizes} loading="eager" alt="" />;
}
