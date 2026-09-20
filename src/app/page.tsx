import { redirect } from "next/navigation";
import { requireUser, characterForUser, gameStateForPlayer } from "@/lib/player";

export default async function Home() {
  const user = await requireUser();
  if (!await characterForUser(user.id)) redirect("/create-character");
  redirect((await gameStateForPlayer()).sea.state === "in_harbor" ? "/harbor" : "/sea");
}
