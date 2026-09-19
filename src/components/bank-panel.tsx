"use client";

import { useActionState, useRef, useState } from "react";
import { transferGold } from "@/app/bank-actions";
import { useGameState } from "@/components/game-state";
import { formatGold, parseGoldAmount, type BankActionResult } from "@/lib/bank";

export function BankPanel() {
  const state = useGameState();
  const [amount, setAmount] = useState("");
  const request = useRef<{ id: string; direction: string; amount: string } | null>(null);
  const [result, action, pending] = useActionState<BankActionResult, FormData>(async (_previous, form) => {
    const attempt = request.current ?? {
      id: crypto.randomUUID(), direction: String(form.get("direction")), amount: String(form.get("amount")),
    };
    request.current = attempt;
    form.set("request_id", attempt.id);
    form.set("direction", attempt.direction);
    form.set("amount", attempt.amount);
    let response: BankActionResult;
    try {
      response = await transferGold(form);
    } catch {
      response = { error: true, retry: true, message: "The transfer could not be confirmed. Retry the same transfer to check it safely." };
    }
    if (!response.retry) request.current = null;
    if (!response.error) setAmount("");
    return response;
  }, {});
  const parsed = parseGoldAmount(amount);
  const blocked = pending || !!state.active_attack || !!state.hospital_until;
  return <div className="o-bank">
    <p className="o-copy">Store your Gold Coins here. Withdraw them to your character before making purchases.</p>
    <dl className="o-bank-balances">
      <div><dt>On your character</dt><dd><output aria-label="Carried Gold Coins">{formatGold(state.gold_coins)}</output><small>Gold Coins available to spend</small></dd></div>
      <div><dt>In the bank</dt><dd><output aria-label="Bank balance">{formatGold(state.bank_gold_coins)}</output><small>Gold Coins in storage</small></dd></div>
    </dl>
    <form action={action} aria-label="Bank transfer" aria-busy={pending}>
      <label className="o-field" htmlFor="bank-amount"><span className="o-field-label">Amount</span>
        <input id="bank-amount" name="amount" type="text" inputMode="numeric" pattern="[0-9]+"
          maxLength={16} autoComplete="off" required value={amount}
          readOnly={pending || !!result.retry} onChange={event => setAmount(event.target.value)}
          aria-describedby="bank-amount-hint" />
      </label>
      <p id="bank-amount-hint" className="o-form-hint">Enter a whole number of Gold Coins. No fees or waiting time.</p>
      <div className="o-bank-actions">
        {result.retry ? <button className="o-training-button" type="submit" disabled={blocked}>Retry transfer</button> : <>
          <button className="o-training-button" type="submit" name="direction" value="deposit"
            disabled={blocked || parsed === null || parsed > state.gold_coins}>Deposit</button>
          <button className="o-training-button" type="submit" name="direction" value="withdraw"
            disabled={blocked || parsed === null || parsed > state.bank_gold_coins}>Withdraw</button>
        </>}
      </div>
    </form>
    <div className="o-bank-feedback" aria-live="polite" aria-atomic="true">
      {pending ? <p>Saving your transfer...</p> : result.message && <p className={result.error ? "o-field-error" : ""}>{result.message}</p>}
      {state.active_attack && <p className="o-copy">Finish your current fight before using the bank.</p>}
    </div>
  </div>;
}
