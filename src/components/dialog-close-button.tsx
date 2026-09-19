import { X } from "lucide-react";

export function DialogCloseButton({ onClose, disabled = false, label = "Close dialog" }: {
  onClose: () => void; disabled?: boolean; label?: string;
}) {
  return <button type="button" className="o-dialog-close" onClick={onClose} disabled={disabled} aria-label={label} title={label}>
    <X aria-hidden="true" />
  </button>;
}
