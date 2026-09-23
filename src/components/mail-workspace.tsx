import { notFound, redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { MailList } from "@/components/mail-list";
import { MailReader } from "@/components/mail-reader";
import { createClient } from "@/lib/supabase/server";
import { mailDetailUrl, parseMailView, type MailViewParams } from "@/lib/messages";

export async function MailWorkspace({ characterId, playerNumber, params, mailId }: {
  characterId: string; playerNumber: number; params: MailViewParams; mailId?: string;
}) {
  const { folder, query, page } = parseMailView(params);
  const client = await createClient();
  const [listing, opened] = await Promise.all([
    client.rpc("get_mailbox", { folder, query, page }),
    mailId ? client.rpc("get_mail", { mail_id: mailId, include_history: params.history === "1" }) : null,
  ]);
  if (opened?.error?.message === "MAIL_NOT_FOUND" || (opened && !opened.error && !opened.data)) notFound();
  if (opened?.error) throw new Error("This mail could not be loaded. Please try again.");
  if (listing.error || !listing.data) throw new Error("Your mailbox could not be loaded. Please try again.");
  const mail = opened?.data;
  if (mail && folder !== "saved" && folder !== mail.direction) {
    redirect(mailDetailUrl(mail.id, mail.direction, query, page, params.history === "1", params.sent === "1"));
  }
  return <div className="o-mail-workspace" data-opened={!!mail}>
    <MailList key={characterId + ":" + folder + ":" + query + ":" + listing.data.page} characterId={characterId} data={listing.data} folder={folder} query={query} openedId={mail?.id} />
    <div className="o-mail-reading-pane">
      {mail ? <MailReader key={characterId + ":" + mail.id} characterId={characterId} playerNumber={playerNumber} mail={mail}
        showHistory={params.history === "1"} folder={folder} query={query} page={listing.data.page} sent={params.sent === "1"} /> :
        <div className="o-mail-paper o-mail-empty"><Mail size={42} strokeWidth={1.25} aria-hidden="true" /><h2>{listing.data.items.length ? "Your letters await" : "A quiet horizon"}</h2>
          <p>{listing.data.items.length ? "Select a mail to read it here." : query ? "Try another search to find your mail." : "New letters will appear in your inbox."}</p>
        </div>}
    </div>
  </div>;
}
