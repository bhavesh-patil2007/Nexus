"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { PencilIcon, CheckIcon, XIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  useConversations,
  useRenameConversation,
} from "../hooks/use-conversations";

import { Id, Doc } from "../../../../convex/_generated/dataModel";

interface PastConversationsDialogProps {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (conversationId: Id<"conversations">) => void;
}

export const PastConversationsDialog = ({
  projectId,
  open,
  onOpenChange,
  onSelect,
}: PastConversationsDialogProps) => {
  const conversations = useConversations(projectId);
  const renameConversation = useRenameConversation();

  const [editingId, setEditingId] = useState<Id<"conversations"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const handleSelect = (conversationId: Id<"conversations">) => {
    onSelect(conversationId);
    onOpenChange(false);
  };

  const handleStartRename = (
    e: React.MouseEvent,
    conversation: Doc<"conversations">,
  ) => {
    e.stopPropagation();
    setEditingId(conversation._id);
    setEditTitle(conversation.title);
  };

  const handleCancelRename = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    if (isRenaming) return;
    setEditingId(null);
    setEditTitle("");
  };

  const handleSaveRename = async (
    e?: React.MouseEvent | React.FormEvent | React.KeyboardEvent,
    conversationId?: Id<"conversations">,
  ) => {
    e?.stopPropagation();
    const targetId = conversationId ?? editingId;
    if (!targetId || isRenaming) return;

    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      toast.error("Conversation title cannot be empty");
      return;
    }

    setIsRenaming(true);
    try {
      await renameConversation({
        conversationId: targetId,
        title: trimmedTitle,
      });
      toast.success("Conversation renamed successfully");
      setEditingId(null);
      setEditTitle("");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to rename conversation";
      toast.error(message);
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setEditingId(null);
          setEditTitle("");
        }
        onOpenChange(nextOpen);
      }}
      title="Past Conversations"
      description="Search and select a past conversation"
    >
      <CommandInput placeholder="Search conversations..." />
      <CommandList>
        <CommandEmpty>No conversations found.</CommandEmpty>
        <CommandGroup heading="Conversations">
          {conversations?.map((conversation) => {
            const isEditing = editingId === conversation._id;

            return (
              <CommandItem
                key={conversation._id}
                value={`${conversation.title}-${conversation._id}`}
                onSelect={() => {
                  if (!isEditing) {
                    handleSelect(conversation._id);
                  }
                }}
                className="group flex items-center justify-between"
              >
                {isEditing ? (
                  <div
                    className="flex items-center gap-1.5 w-full py-0.5"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      disabled={isRenaming}
                      autoFocus
                      aria-label="Conversation title"
                      className="h-7 text-sm py-1 px-2"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveRename(e, conversation._id);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          handleCancelRename(e);
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Save conversation title"
                      title="Save"
                      disabled={isRenaming || !editTitle.trim()}
                      onClick={(e) => handleSaveRename(e, conversation._id)}
                    >
                      {isRenaming ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <CheckIcon className="size-3.5 text-primary" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Cancel renaming"
                      title="Cancel"
                      disabled={isRenaming}
                      onClick={handleCancelRename}
                    >
                      <XIcon className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-0.5 truncate pr-2">
                      <span className="truncate">{conversation.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(conversation._creationTime, {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Rename ${conversation.title}`}
                      title="Rename conversation"
                      className="size-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-opacity shrink-0"
                      onClick={(e) => handleStartRename(e, conversation)}
                    >
                      <PencilIcon className="size-3.5" />
                    </Button>
                  </>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};