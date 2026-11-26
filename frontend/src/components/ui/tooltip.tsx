import * as TT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = TT.Provider;

export function Tip({ label, children, side = "right", disabled }: { label: string; children: ReactNode; side?: "right" | "top" | "bottom"; disabled?: boolean }) {
  if (disabled) return <>{children}</>;
  return (
    <TT.Root delayDuration={150}>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content side={side} sideOffset={8} className="z-50 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-lift">
          {label}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  );
}
