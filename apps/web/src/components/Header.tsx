import type { ReactNode } from "react";

export function Header({ right }: { right?: ReactNode }) {
  return (
    <header className="site-header">
      <div className="inner">
        <a className="brand" href="/">
          <span className="logo">K</span>
          Kernel Playground
        </a>
        <nav className="nav">
          <a href="/playground">Playground</a>
          <a
            href="https://github.com/UtkarshRjn/kernel-playground"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          {right}
        </nav>
      </div>
    </header>
  );
}
