"use client";

import { useMemo } from "react";
import {
  CheckCircle2Icon,
  CircleIcon,
  ClockIcon,
  FileCodeIcon,
  Loader2Icon,
  WrenchIcon,
  XCircleIcon,
  ChevronDownIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Doc } from "../../../../convex/_generated/dataModel";

interface ExecutionActivityTimelineProps {
  events: Doc<"executionEvents">[];
  isProcessing: boolean;
}

export const ExecutionActivityTimeline = ({
  events,
  isProcessing,
}: ExecutionActivityTimelineProps) => {
  // Filter for tool events and meaningful execution milestones
  const toolAndMilestoneEvents = useMemo(() => {
    // We group by toolExecutionId for tools so we show the latest state of each tool
    const toolMap = new Map<string, Doc<"executionEvents">>();
    const milestones: Doc<"executionEvents">[] = [];

    for (const evt of events) {
      if (evt.toolExecutionId) {
        toolMap.set(evt.toolExecutionId, evt);
      } else if (
        evt.eventType === "execution_start" ||
        evt.eventType === "execution_complete" ||
        evt.eventType === "execution_cancel" ||
        evt.eventType === "execution_fail"
      ) {
        milestones.push(evt);
      }
    }

    const uniqueToolEvents = Array.from(toolMap.values());
    const combined = [...uniqueToolEvents, ...milestones];
    combined.sort((a, b) => a.startedAt - b.startedAt);
    return combined;
  }, [events]);

  if (toolAndMilestoneEvents.length === 0) {
    if (isProcessing) {
      return (
        <div className="flex items-center gap-2 text-muted-foreground text-xs py-1">
          <Loader2Icon className="size-3.5 animate-spin text-primary" />
          <span>Starting assistant execution...</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-2 my-2 w-full max-w-full overflow-hidden not-prose">
      {toolAndMilestoneEvents.map((evt) => {
        if (!evt.toolExecutionId) {
          // Milestone item (start/complete/cancel/fail)
          return (
            <div
              key={evt._id}
              className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1 rounded bg-muted/40"
            >
              {evt.status === "running" ? (
                <Loader2Icon className="size-3.5 animate-spin text-primary shrink-0" />
              ) : evt.status === "completed" ? (
                <CheckCircle2Icon className="size-3.5 text-emerald-500 shrink-0" />
              ) : evt.status === "cancelled" ? (
                <CircleIcon className="size-3.5 text-amber-500 shrink-0" />
              ) : (
                <XCircleIcon className="size-3.5 text-rose-500 shrink-0" />
              )}
              <span className="font-medium truncate">{evt.summary}</span>
              {evt.iteration > 0 && (
                <Badge variant="outline" className="text-[10px] ml-auto py-0 px-1">
                  Step {evt.iteration}
                </Badge>
              )}
            </div>
          );
        }

        // Tool item collapsible
        const isRunning = evt.status === "running";
        const isCompleted = evt.status === "completed";
        const isFailed = evt.status === "failed";

        return (
          <Collapsible
            key={evt.toolExecutionId}
            className="w-full rounded-md border border-border/60 bg-card/50 text-xs overflow-hidden"
          >
            <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 p-2 hover:bg-muted/50 transition-colors text-left">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {isRunning ? (
                  <Loader2Icon className="size-3.5 animate-spin text-primary shrink-0" />
                ) : isCompleted ? (
                  <CheckCircle2Icon className="size-3.5 text-emerald-500 shrink-0" />
                ) : isFailed ? (
                  <XCircleIcon className="size-3.5 text-rose-500 shrink-0" />
                ) : (
                  <ClockIcon className="size-3.5 text-muted-foreground shrink-0" />
                )}
                <WrenchIcon className="size-3 text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground truncate">
                  {evt.toolName ?? "Tool"}
                </span>
                <span className="text-muted-foreground truncate hidden sm:inline">
                  {evt.description}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Badge
                  variant={
                    isCompleted
                      ? "secondary"
                      : isFailed
                        ? "destructive"
                        : isRunning
                          ? "default"
                          : "outline"
                  }
                  className="text-[10px] px-1.5 py-0 h-4 capitalize"
                >
                  {evt.status}
                </Badge>
                {evt.iteration > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    #{evt.iteration}
                  </span>
                )}
                <ChevronDownIcon className="size-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent className="px-2.5 py-2 border-t border-border/40 bg-muted/20 space-y-1.5">
              <div className="text-muted-foreground">
                <span className="font-semibold text-foreground">Action:</span>{" "}
                {evt.description}
              </div>

              {evt.filePaths && evt.filePaths.length > 0 && (
                <div className="space-y-1">
                  <div className="font-semibold text-foreground flex items-center gap-1">
                    <FileCodeIcon className="size-3" />
                    <span>Files:</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {evt.filePaths.map((path) => (
                      <span
                        key={path}
                        className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded border border-border/50 text-foreground break-all"
                      >
                        {path}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {evt.summary && (
                <div className="text-foreground/90">
                  <span className="font-semibold">Summary:</span> {evt.summary}
                </div>
              )}

              {evt.error && (
                <div className="text-destructive font-medium bg-destructive/10 p-1.5 rounded">
                  Error: {evt.error}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
};
