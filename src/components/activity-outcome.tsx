"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Coins, X } from "lucide-react";
import { ItemImage } from "@/components/inventory/item-image";
import { activityOutcome, activityProgressMessage, activityRewards, type ActivityItemReward, type ActivityResult } from "@/lib/activities";
import { formatGold } from "@/lib/bank";
import { formatItemCount } from "@/lib/inventory";

function RewardItem({ item }: { item: ActivityItemReward }) {
  const id = useId();
  const ref = useRef<HTMLLIElement>(null);
  const [hint, setHint] = useState<{ left: number; width: number } | null>(null);
  const showHint = useCallback(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(200, window.innerWidth - 24);
    setHint({ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)) - rect.left });
  }, []);
  useEffect(() => {
    if (!hint) return;
    const dismiss = () => setHint(null);
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) dismiss();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", showHint);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", showHint);
    };
  }, [hint, showHint]);
  return <li ref={ref} className="o-activity-reward-item"
    onPointerEnter={event => { if (event.pointerType !== "touch") showHint(); }}
    onPointerLeave={() => { if (!ref.current?.contains(document.activeElement)) setHint(null); }}>
    <button type="button" className="o-activity-reward-button" aria-label={formatItemCount(item.quantity) + " × " + item.name}
      aria-describedby={hint ? id : undefined} onFocus={showHint} onBlur={() => setHint(null)} onClick={showHint}>
      <ItemImage item={item} />
      <span className="o-activity-reward-quantity" aria-hidden="true">×{formatItemCount(item.quantity)}</span>
    </button>
    {hint && <span id={id} role="tooltip" className="o-activity-item-tooltip" style={{ left: hint.left, maxWidth: hint.width }}>{item.name}</span>}
  </li>;
}

export function ActivityFeedback({ result, activityName, onClose }: { result: ActivityResult | null; activityName: string; onClose: () => void }) {
  const [retained, setRetained] = useState(result);
  const ref = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const wasVisible = useRef(false);
  if (result && result !== retained) setRetained(result);
  const shown = result ?? retained, visible = result !== null;

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      animation.current?.cancel();
      animation.current = null;
      return;
    }
    if (visible && wasVisible.current && !animation.current) return;
    const previous = animation.current;
    const height = wasVisible.current || previous ? node.getBoundingClientRect().height : 0;
    const opacity = wasVisible.current || previous ? getComputedStyle(node).opacity : "0";
    previous?.cancel();
    wasVisible.current = visible;
    node.style.overflow = "hidden";
    const motion = node.animate([
      { height: height + "px", opacity },
      { height: (visible ? node.getBoundingClientRect().height : 0) + "px", opacity: visible ? 1 : 0 },
    ], {
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : visible ? 240 : 150,
      easing: "cubic-bezier(.22,.61,.36,1)", fill: "both",
    });
    animation.current = motion;
    motion.onfinish = () => {
      if (animation.current !== motion) return;
      if (visible) {
        motion.cancel();
        animation.current = null;
        node.style.overflow = "";
      } else setRetained(null);
    };
    return () => { motion.onfinish = null; };
  }, [shown, visible]);
  useLayoutEffect(() => () => { animation.current?.cancel(); animation.current = null; wasVisible.current = false; }, []);

  if (!shown) return null;
  return <div ref={ref} className="o-activity-reveal" data-closing={!visible} inert={!visible} aria-hidden={!visible}>
    <div className="o-activity-reveal-body"><ActivityOutcome result={shown} activityName={activityName} onClose={onClose} /></div>
  </div>;
}

function ActivityOutcome({ result, activityName, onClose }: { result: ActivityResult; activityName: string; onClose: () => void }) {
  const receipt = result.error ? undefined : result.receipt;
  const outcome = receipt ? activityOutcome(receipt) : "unconfirmed";
  const rewards = receipt ? activityRewards(receipt) : { items: [], gold_coins: 0 };
  const label = receipt ? outcome === "success" ? "Success" : "Failure" : result.retry ? "Unconfirmed" : "Unable to complete";
  const Icon = outcome === "success" ? CheckCircle2 : CircleAlert;
  return <section className="o-activity-result" data-outcome={outcome} aria-label={activityName + " result"}>
    <button type="button" className="o-activity-result-close" aria-label={"Close " + activityName + " result"} onClick={onClose}><X aria-hidden="true" /></button>
    <div className="o-activity-result-row">
      <h3><Icon aria-hidden="true" />{label}</h3>
      {(rewards.items.length > 0 || rewards.gold_coins > 0) && <ul className="o-activity-rewards" aria-label="Activity rewards">
        {rewards.items.map((item, index) => <RewardItem key={item.item_id + ":" + index} item={item} />)}
        {rewards.gold_coins > 0 && <li className="o-activity-gold"><Coins aria-hidden="true" /><span>{formatGold(rewards.gold_coins)} Gold Coins</span></li>}
      </ul>}
    </div>
    <p>{receipt ? (outcome === "failure" ? "Nothing found. " : "") + activityProgressMessage(receipt) : result.message}</p>
  </section>;
}
