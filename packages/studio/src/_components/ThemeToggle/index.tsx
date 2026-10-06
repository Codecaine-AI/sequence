import { Icon } from "@/shared/_components/Icon";
import { useTheme } from "./useTheme";

export type ThemeToggleProps = Record<string, never>;

/** The topbar's theme toggle: pressed while the page is dark. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      type="button"
      className="ds-shell-icon-button"
      aria-pressed={theme === "dark"}
      aria-label="Dark theme"
      title="Dark theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Icon name="moon" />
    </button>
  );
}
