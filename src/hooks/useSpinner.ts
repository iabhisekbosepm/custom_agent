import { useState, useEffect } from "react";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function useSpinner(active: boolean): { frame: string; tick: number } {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) {
      setTick(0);
      return;
    }
    const id = setInterval(() => {
      setTick((t) => t + 1);
    }, 80);
    return () => clearInterval(id);
  }, [active]);

  return { frame: FRAMES[tick % FRAMES.length], tick };
}
