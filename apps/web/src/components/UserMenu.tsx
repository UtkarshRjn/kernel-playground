"use client";

import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { resetIdentity } from "./posthog";

function initialsOf(name?: string | null, email?: string | null): string {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0]![0]! + parts[1]![0]! : base.slice(0, 2);
  return letters.toUpperCase();
}

export function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const user = session?.user;
  if (!user) return null;

  return (
    <div className="usermenu">
      <button
        className="avatar"
        onClick={() => setOpen((o) => !o)}
        title={user.name ?? user.email ?? "Account"}
        aria-label="Account menu"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span>{initialsOf(user.name, user.email)}</span>
        )}
      </button>

      {open && (
        <>
          <div className="usermenu-backdrop" onClick={() => setOpen(false)} />
          <div className="usermenu-pop">
            <div className="usermenu-id">
              {user.name && <div className="usermenu-name">{user.name}</div>}
              {user.email && <div className="usermenu-email">{user.email}</div>}
            </div>
            <button
              className="usermenu-signout"
              onClick={() => {
                resetIdentity();
                void signOut({ callbackUrl: "/" });
              }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
