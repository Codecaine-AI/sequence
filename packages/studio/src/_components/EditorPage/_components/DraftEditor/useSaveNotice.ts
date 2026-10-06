import { useCallback, useEffect, useRef, useState } from "react";

/** The topbar's "Saved" notice: shown for 1.1s after each save or rename. */
export function useSaveNotice(): {
  saveNotice: "idle" | "saved";
  brieflyShowSaved: () => void;
} {
  const [saveNotice, setSaveNotice] = useState<"idle" | "saved">("idle");
  const noticeTimerRef = useRef<number | null>(null);

  const brieflyShowSaved = useCallback(() => {
    setSaveNotice("saved");
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setSaveNotice("idle");
      noticeTimerRef.current = null;
    }, 1100);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  return { saveNotice, brieflyShowSaved };
}
