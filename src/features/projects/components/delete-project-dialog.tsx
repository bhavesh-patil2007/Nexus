"use client";

import { useState } from "react";
import { Loader2Icon, AlertTriangleIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onConfirm: () => Promise<void>;
  isDeleting?: boolean;
}

export const DeleteProjectDialog = ({
  open,
  onOpenChange,
  projectName,
  onConfirm,
  isDeleting = false,
}: DeleteProjectDialogProps) => {
  const [confirmName, setConfirmName] = useState("");

  const isMatching = confirmName === projectName;

  const handleOpenChange = (nextOpen: boolean) => {
    if (isDeleting) return; // Prevent closing while deletion is in progress
    if (!nextOpen) {
      setConfirmName("");
    }
    onOpenChange(nextOpen);
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMatching || isDeleting) return;
    await onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <form onSubmit={handleDelete} className="space-y-4">
          <AlertDialogHeader className="sm:text-left text-left">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangleIcon className="size-5 shrink-0" />
              <AlertDialogTitle>Delete project</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm text-muted-foreground pt-1">
              This action cannot be undone. This will permanently delete the project{" "}
              <strong className="text-foreground font-semibold">
                {projectName}
              </strong>
              , along with all of its files, conversations, messages, and associated storage.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Field className="space-y-2">
            <FieldLabel className="text-xs text-muted-foreground font-normal">
              To confirm, type{" "}
              <span className="font-semibold text-foreground select-all">
                {projectName}
              </span>{" "}
              below:
            </FieldLabel>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={projectName}
              disabled={isDeleting}
              autoFocus
              className="font-mono text-sm"
              autoComplete="off"
              spellCheck="false"
            />
          </Field>

          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={!isMatching || isDeleting}
              className="gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                "Delete project"
              )}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
};
