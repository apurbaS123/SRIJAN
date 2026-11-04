"use client";
import { useState } from "react";

export function PasswordField({ id, label, value, onChange, autoComplete, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: "current-password" | "new-password"; hint?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="row">
        <input id={id} className="input grow" type={shown ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn btn-sm btn-ghost" aria-pressed={shown} onClick={() => setShown(!shown)}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}
