import { Github } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./theme";
import { UserMenu } from "./UserMenu";

export function Header({ right }: { right?: ReactNode }) {
  return (
    <header className="site-header">
      <div className="inner">
        <a className="brand" href="/">
          <Logo />
          Kernel Playground
        </a>
        <nav className="nav">
          <a
            className="link"
            href="https://github.com/UtkarshRjn/kernel-playground"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={15} /> GitHub
          </a>
          <ThemeToggle />
          {right}
          <UserMenu />
        </nav>
      </div>
    </header>
  );
}
