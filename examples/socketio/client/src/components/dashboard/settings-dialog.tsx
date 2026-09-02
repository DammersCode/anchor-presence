import { useState } from "react";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { cn } from "../../lib/cn";
import { INTERPOLATOR_STYLES } from "../../cursors/interpolators";
import type { InterpolatorStyle } from "../../cursors/interpolators";

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  interpolatorStyle: InterpolatorStyle;
  onInterpolatorStyleChange: (style: InterpolatorStyle) => void;
}

function InterpolatorStyleRow({
  value,
  onChange,
}: {
  value: InterpolatorStyle;
  onChange: (style: InterpolatorStyle) => void;
}) {
  return (
    <div data-anchor="settings.dialog.cursorMotion" className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-gray-900">Cursor motion</p>
      <div role="radiogroup" aria-label="Cursor motion" className="flex gap-2">
        {INTERPOLATOR_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            role="radio"
            aria-checked={value === style}
            data-testid={`interp-option-${style}`}
            onClick={() => onChange(style)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
              value === style ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
            )}
          >
            {style}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({ anchorId, label, description }: { anchorId: string; label: string; description: string }) {
  const [enabled, setEnabled] = useState(true);
  return (
    <div
      data-anchor={`settings.dialog.${anchorId}`}
      className="flex items-center justify-between gap-4"
    >
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        data-anchor={`settings.dialog.${anchorId}.switch`}
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

export function SettingsDialog({
  open,
  onClose,
  interpolatorStyle,
  onInterpolatorStyleChange,
}: SettingsDialogProps) {
  const [workspaceName, setWorkspaceName] = useState("Acme Storefront");

  return (
    <Dialog
      data-anchor="settings.dialog"
      data-testid="anchor-settings.dialog"
      open={open}
      onClose={onClose}
    >
      <DialogHeader>
        <DialogTitle>Workspace settings</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div
          data-anchor="settings.dialog.workspaceName"
          className="flex flex-col gap-1.5"
        >
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

        <Button
          data-anchor="settings.dialog.invite"
          data-testid="anchor-settings.dialog.invite"
          variant="outline"
          className="self-start"
        >
          + Invite member
        </Button>

        <InterpolatorStyleRow value={interpolatorStyle} onChange={onInterpolatorStyleChange} />
      </DialogBody>
      <DialogFooter>
        <Button data-anchor="settings.dialog.cancel" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button data-anchor="settings.dialog.save" onClick={onClose}>
          Save
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
