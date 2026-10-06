import { useContext } from "react";
import type { ShellLinkProps } from "../AppShell";
import { NavigateContext } from "./navigate-context";

export { NavigateContext } from "./navigate-context";

export type NavButtonProps = ShellLinkProps;

/** The shell's link component: a nav row that switches the in-memory route. */
export function NavButton({ href, className, title, children, ...rest }: NavButtonProps) {
  const navigate = useContext(NavigateContext);
  const dataActive = (rest as Record<string, unknown>)["data-active"] as string | undefined;
  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-current={rest["aria-current"]}
      data-active={dataActive}
      onClick={() => navigate(href)}
    >
      {children}
    </button>
  );
}
