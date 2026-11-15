"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export type Theme = "light" | "dark";

export const THEME_KEY = "srijan-theme";

/**
 * Runs before first paint, inlined in the document head. Dark is the site's default, so the
 * markup already ships with data-theme="dark" and this only has to apply a saved choice of
 * light. The operating system's preference is deliberately not consulted: the site is dark
 * for everyone until they say otherwise.
 * Kept as a string because it has to execute ahead of React.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){}})()`;

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private browsing can refuse storage; the theme still applies for this page.
  }
}

function Sun() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

/**
 * Switches the site between light and dark.
 *
 * `floating` is for the home page, whose hero draws its own nav instead of the site header —
 * there the button parks itself in the top-right corner rather than sitting in a row.
 */
export function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>("dark");

  // The server can't know a saved choice, so read it after mount from what the head script set.
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  // The floating one belongs to the home page only; everywhere else the header carries it.
  if (floating && pathname !== "/") return null;

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    apply(next);
    setTheme(next);
  }

  // Until the effect has read <html>, assume dark — the same thing the server rendered,
  // so the first paint matches and the label is never announced wrongly.
  const dark = theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      className={`theme-toggle${floating ? " theme-toggle-float" : ""}`}
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <span className="theme-icon">{dark ? <Sun /> : <Moon />}</span>
    </button>
  );
}
