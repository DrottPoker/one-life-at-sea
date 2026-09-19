import gameplay from "../../config/gameplay.json";
import auth from "../../config/auth.json";
import frontend from "../../config/frontend.json";

// Only browser-safe settings belong in this module.
export { gameplay, auth, frontend };

export function durationLabel(seconds: number) {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return minutes + (minutes === 1 ? " minute" : " minutes");
  }
  return seconds + (seconds === 1 ? " second" : " seconds");
}
