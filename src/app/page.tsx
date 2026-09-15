import { redirect } from "next/navigation";
import { requireUser, characterForUser } from "@/lib/player";

export default async function Home() {
  const user = await requireUser();
  redirect(await characterForUser(user.id) ? "/harbor" : "/create-character");
}
