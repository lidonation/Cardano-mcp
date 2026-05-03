import React from "react";

type CalloutType = "info" | "warn" | "ok" | "danger";

interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children: React.ReactNode;
}

export function Callout({ type = "info", title, children }: CalloutProps) {
  return (
    <div className={`callout ${type}`}>
      <div className="bar" />
      <div>
        {title && <div className="title">{title}</div>}
        <div className="body">{children}</div>
      </div>
    </div>
  );
}
