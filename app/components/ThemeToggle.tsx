"use client";

import styles from "./ThemeToggle.module.css";

/** A light/dark switch, deliberately stateless.
 *
 * The button shows one neutral glyph rather than a sun or a moon, because
 * the server cannot know which theme a visitor is seeing: their choice
 * lives in localStorage, and absent a choice it comes from their operating
 * system. Rendering a state-specific icon would therefore mismatch during
 * hydration and flicker on every load. The glyph never changes, so there
 * is nothing to get wrong.
 *
 * Reading the live state at click time — rather than tracking it — keeps
 * this correct even if the theme is changed elsewhere, such as by the
 * visitor switching their system appearance while the page is open. */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const chosen = root.getAttribute("data-theme");
    const showingDark =
      chosen === "dark" ||
      (!chosen && window.matchMedia("(prefers-color-scheme: dark)").matches);

    const next = showingDark ? "light" : "dark";
    root.setAttribute("data-theme", next);

    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private windows and blocked site data throw on write. The theme
      // still applies for this visit; it just will not be remembered.
    }
  }

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.button}
        onClick={toggle}
        aria-label="Switch between light and dark"
        title="Switch between light and dark"
      >
        <span aria-hidden="true">◐</span>
      </button>
    </div>
  );
}
