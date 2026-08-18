import { useEffect, useState } from "react";
import { useCursorAnchor } from "@anchor-presence/react";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { cn } from "../../lib/cn";
import { setLocalSettingsOpen } from "../../cursors/visibilityPolicy";

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

function ToggleRow({ anchorId, label, description }: { anchorId: string; label: string; description: string }) {
  const [enabled, setEnabled] = useState(true);
  const rowAnchor = useCursorAnchor(`settings.dialog.${anchorId}`);
  const switchAnchor = useCursorAnchor(`settings.dialog.${anchorId}.switch`);
  return (
    <div ref={rowAnchor} className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        ref={switchAnchor}
        role="switch"
        aria-checked={enabled}
        onClick={() => setEnabled((v) => !v)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          enabled ? "bg-indigo-600" : "bg-gray-200",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            enabled ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [workspaceName, setWorkspaceName] = useState("Acme Storefront");

  const dialogAnchor = useCursorAnchor("settings.dialog");
  const workspaceNameAnchor = useCursorAnchor("settings.dialog.workspaceName");
  const inviteAnchor = useCursorAnchor("settings.dialog.invite");
  const cancelAnchor = useCursorAnchor("settings.dialog.cancel");
  const saveAnchor = useCursorAnchor("settings.dialog.save");

  // UI context policy (spec §12): announce "in Settings" while open, clear on close.
  // Presence context itself (page + dialog) is centralized in App so page changes don't get clobbered.
  useEffect(() => {
    setLocalSettingsOpen(open);
  }, [open]);

  return (
    <Dialog ref={dialogAnchor} data-testid="anchor-settings.dialog" open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Workspace settings</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div ref={workspaceNameAnchor} className="flex flex-col gap-1.5">
          <label htmlFor="workspace-name" className="text-sm font-medium text-gray-700">
            Workspace name
          </label>
          <Input
            id="workspace-name"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
          />
        </div>

        <ToggleRow
          anchorId="notifications"
          label="Email notifications"
          description="Get notified about order and customer activity."
        />
        <ToggleRow
          anchorId="publicProfile"
          label="Public storefront"
          description="Allow this workspace to be listed publicly."
        />

        <Button ref={inviteAnchor} data-testid="anchor-settings.dialog.invite" variant="outline" className="self-start">
          + Invite member
        </Button>
      </DialogBody>
      <DialogFooter>
        <Button ref={cancelAnchor} variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button ref={saveAnchor} onClick={onClose}>
          Save
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
