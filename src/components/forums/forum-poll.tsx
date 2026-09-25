"use client";

import { useId, useState, useTransition } from "react";
import { BarChart3, Plus, X } from "lucide-react";
import { useNavigationActivity } from "@/components/game-refresh";
import { MessageTime } from "@/components/messages/message-time";
import { ForumDialog } from "@/components/forums/forum-dialog";
import { closeForumPoll, voteForumPoll } from "@/app/forum-actions";
import { gameplay } from "@/config/public";
import { forumPollDurations, type ForumPoll, type ForumPollDetails, type ForumPollInput } from "@/lib/forums";

export function emptyForumPoll(): ForumPollInput {
  return { question: "", options: ["", ""], max_choices: 1, days: forumPollDurations.includes(7) ? 7 : null };
}

// The poll is optional and is created together with its thread; it cannot be edited afterwards.
export function ForumPollBuilder({ value, onChange, disabled }: { value: ForumPollInput | null; onChange: (value: ForumPollInput | null) => void; disabled: boolean }) {
  const id = useId();
  if (!value) {
    return <div className="o-forum-poll-builder"><button type="button" className="o-text-button" disabled={disabled} onClick={() => onChange(emptyForumPoll())}>
      <BarChart3 aria-hidden="true" />Add a poll</button></div>;
  }
  const update = (change: Partial<ForumPollInput>) => {
    const next = { ...value, ...change };
    onChange({ ...next, max_choices: Math.min(next.max_choices, next.options.length) });
  };
  return <fieldset className="o-forum-poll-builder" disabled={disabled}>
    <legend>Poll</legend>
    <p className="o-copy">Polls cannot be edited once the thread is posted. Voters see the results after voting or when the poll closes.</p>
    <div className="o-forum-field"><label htmlFor={id + "-question"}>Question</label>
      <input id={id + "-question"} value={value.question} maxLength={gameplay.forum.pollQuestionMaxLength * 2} onChange={event => update({ question: event.target.value })} /></div>
    <ol className="o-forum-poll-options" aria-label="Poll options">{value.options.map((option, index) => <li key={index}>
      <label className="sr-only" htmlFor={id + "-option-" + index}>Option {index + 1}</label>
      <input id={id + "-option-" + index} value={option} placeholder={"Option " + (index + 1)} maxLength={gameplay.forum.pollOptionMaxLength * 2}
        onChange={event => update({ options: value.options.map((item, position) => position === index ? event.target.value : item) })} />
      <button type="button" className="o-forum-poll-remove" aria-label={"Remove option " + (index + 1)} title="Remove option" disabled={value.options.length <= 2}
        onClick={() => update({ options: value.options.filter((_, position) => position !== index) })}><X aria-hidden="true" /></button>
    </li>)}</ol>
    <div className="o-forum-poll-settings">
      <button type="button" className="o-text-button" disabled={value.options.length >= gameplay.forum.pollOptionsMax}
        onClick={() => update({ options: [...value.options, ""] })}><Plus aria-hidden="true" />Add option</button>
      <label>Voters may choose <select value={value.max_choices} onChange={event => update({ max_choices: Number(event.target.value) })}>
        {value.options.map((_, index) => <option key={index} value={index + 1}>{index === 0 ? "1 option" : "up to " + (index + 1) + " options"}</option>)}
      </select></label>
      <label>Closes <select value={value.days ?? ""} onChange={event => update({ days: event.target.value ? Number(event.target.value) : null })}>
        {forumPollDurations.map(days => <option key={days} value={days}>{days === 1 ? "after 1 day" : "after " + days + " days"}</option>)}
        <option value="">never</option>
      </select></label>
      <button type="button" className="o-text-button" onClick={() => onChange(null)}><X aria-hidden="true" />Remove poll</button>
    </div>
  </fieldset>;
}

function closedLabel(poll: ForumPollDetails) {
  if (poll.closed_by === "author") return "Closed by the thread's author";
  if (poll.closed_by === "moderator") return "Closed by a moderator";
  if (poll.removed) return "Removed by a moderator";
  return "Closed";
}

// Results appear after voting, when the poll closes, or for captains who cannot vote.
export function ForumPollView({ characterId, threadId, poll }: { characterId: string; threadId: string; poll: ForumPoll }) {
  const [choices, setChoices] = useState<number[] | null>(null), [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false), [pending, start] = useTransition(), id = useId();
  useNavigationActivity(pending);
  if (!("options" in poll)) return <section className="o-forum-poll" aria-label="Poll"><p className="o-copy">A moderator removed this poll.</p></section>;
  const voted = poll.my_choices.length > 0, editing = poll.can_vote && (choices !== null || !voted);
  const selected = choices ?? poll.my_choices, single = poll.max_choices === 1;
  function submit(next: number[]) {
    start(async () => {
      try {
        const result = await voteForumPoll(characterId, threadId, next);
        if (result.error) setError(result.error); else { setError(null); setChoices(null); }
      } catch { setError("Your vote could not be saved. Please try again."); }
    });
  }
  function close() {
    start(async () => {
      try {
        const result = await closeForumPoll(characterId, threadId);
        if (result.error) setError(result.error); else { setError(null); setConfirming(false); }
      } catch { setError("The poll could not be closed. Please try again."); }
    });
  }
  const toggle = (option: number) => setChoices(single ? [option] : selected.includes(option) ? selected.filter(item => item !== option)
    : selected.length < poll.max_choices ? [...selected, option] : selected);
  return <section className="o-forum-poll" aria-labelledby={id + "-question"} data-closed={poll.closed}>
    <header><h3 id={id + "-question"}><BarChart3 aria-hidden="true" />{poll.question}</h3>
      <p className="o-copy">{poll.voters} {poll.voters === 1 ? "voter" : "voters"} · {poll.closed ? closedLabel(poll)
        : poll.closes_at ? <>Closes <MessageTime value={poll.closes_at} /></> : "No end date"}{!single && " · Choose up to " + poll.max_choices}</p>
      {poll.removed && <p className="o-forum-warning" role="status">Removed by a moderator. Players only see that it was removed.</p>}
    </header>
    {editing ? <form onSubmit={event => { event.preventDefault(); if (selected.length) submit(selected); }}>
      <fieldset disabled={pending}><legend className="sr-only">{poll.question}</legend>
        {poll.options.map(option => <label key={option.number} className="o-forum-poll-choice">
          <input type={single ? "radio" : "checkbox"} name={id + "-choice"} checked={selected.includes(option.number)} onChange={() => toggle(option.number)} />
          {option.label}</label>)}
      </fieldset>
      <div className="o-forum-inline-actions">
        {voted && <button type="button" className="o-text-button" disabled={pending} onClick={() => setChoices(null)}>Cancel</button>}
        <button type="submit" className="o-primary" disabled={pending || !selected.length}>{pending ? "Saving..." : voted ? "Save vote" : "Vote"}</button>
      </div>
      {!poll.results && <p className="o-copy">Vote to see the results.</p>}
    </form> : null}
    {poll.results && !editing && <ol className="o-forum-poll-results">{poll.options.map(option => {
      const votes = option.votes ?? 0, share = poll.voters ? Math.round(votes / poll.voters * 100) : 0;
      return <li key={option.number} data-mine={poll.my_choices.includes(option.number)}>
        <span className="o-forum-poll-label">{option.label}{poll.my_choices.includes(option.number) && <small> (your vote)</small>}</span>
        <span className="o-forum-poll-bar" aria-hidden="true"><span style={{ width: share + "%" }} /></span>
        <span className="o-forum-poll-count">{votes} ({share}%)</span>
      </li>;
    })}</ol>}
    {!editing && !poll.results && <p className="o-copy">The results appear when the poll closes.</p>}
    {((poll.can_vote && voted && !editing) || poll.can_close) && <div className="o-forum-inline-actions">
      {poll.can_vote && voted && !editing && <>
        <button type="button" className="o-text-button" disabled={pending} onClick={() => setChoices(poll.my_choices)}>Change vote</button>
        <button type="button" className="o-text-button" disabled={pending} onClick={() => submit([])}>Withdraw vote</button></>}
      {poll.can_close && <button type="button" className="o-text-button" disabled={pending} onClick={() => setConfirming(true)}>Close poll</button>}
    </div>}
    {error && <p role="alert" className="o-field-error">{error}</p>}
    <ForumDialog open={confirming} title="Close this poll?" busy={pending} onClose={() => setConfirming(false)}>
      <p>Nobody can vote after this, and everyone sees the results. A closed poll cannot be reopened.</p>
      <div className="o-item-dialog-actions"><button type="button" className="o-text-button" disabled={pending} onClick={() => setConfirming(false)}>Cancel</button>
        <button type="button" className="o-primary" disabled={pending} onClick={close}>{pending ? "Closing..." : "Close poll"}</button></div>
    </ForumDialog>
  </section>;
}
