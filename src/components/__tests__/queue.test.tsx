// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { reduceEvent, startRun } from "@/ui/runState";
import { WalkView } from "../WalkView";

afterEach(cleanup);

const noop = () => {};

describe("WalkView high-demand notice", () => {
  it("shows a calm queue message with the wait, and removes it when work resumes", () => {
    const queued = reduceEvent(startRun(), { type: "queue", waitSeconds: 12 });
    const { rerender } = render(<WalkView state={queued} onChoose={noop} onRetry={noop} onReset={noop} />);
    expect(screen.getByText(/High demand: your brief is next, about 12 seconds\./)).toBeTruthy();
    rerender(<WalkView state={reduceEvent(queued, { type: "stage", stage: "synthesis", status: "start" })} onChoose={noop} onRetry={noop} onReset={noop} />);
    expect(screen.queryByText(/High demand/)).toBeNull();
  });

  it("says second for one second", () => {
    render(<WalkView state={reduceEvent(startRun(), { type: "queue", waitSeconds: 1 })} onChoose={noop} onRetry={noop} onReset={noop} />);
    expect(screen.getByText(/about 1 second\./)).toBeTruthy();
  });
});
