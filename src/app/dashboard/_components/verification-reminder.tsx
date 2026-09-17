"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const DISMISSAL_KEY = "closer:verification-reminder-dismissed-until";
const DISMISSAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function VerificationReminder() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const dismissedUntil = Number(
          window.localStorage.getItem(DISMISSAL_KEY),
        );
        setVisible(
          !Number.isFinite(dismissedUntil) || dismissedUntil < Date.now(),
        );
      } catch {
        setVisible(true);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  function remindLater() {
    try {
      window.localStorage.setItem(
        DISMISSAL_KEY,
        String(Date.now() + DISMISSAL_WINDOW_MS),
      );
    } catch {
      // The reminder still dismisses for this render if storage is blocked.
    }
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <aside className="verification-reminder" role="status">
      <div>
        <p className="verification-reminder-label">Account status</p>
        <strong>Email verification is still pending.</strong>
        <p>
          Your account is ready to use. No email was sent in this demo, so you
          can skip for now and we will remind you later.
        </p>
      </div>
      <div className="verification-reminder-actions">
        <Link className="button button-primary" href="/account/verification">
          Verify your email
        </Link>
        <button className="button button-quiet" onClick={remindLater} type="button">
          Skip for now
        </button>
      </div>
    </aside>
  );
}
