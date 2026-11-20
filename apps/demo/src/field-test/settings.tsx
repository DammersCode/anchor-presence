import type { UiProps } from "./variant";

const sections = [
  { id: "profile", title: "Profile", fields: ["name", "email", "company"] },
  { id: "security", title: "Security", fields: ["password", "recovery", "phone"] },
  { id: "notify", title: "Notifications", fields: ["digest", "alerts"] },
];

const input = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm";

function Field({ section, name, jumpy }: { section: string; name: string; jumpy: boolean }) {
  const id = `sett.${section}.${name}`;
  return (
    <div
      data-anchor={`${id}.row`}
      className={jumpy ? "grid grid-cols-1 items-center gap-2 md:grid-cols-3" : "flex flex-col gap-1"}
    >
      <label data-anchor={`${id}.label`} className="text-sm text-gray-600">
        {name}
      </label>
      <input
        data-anchor={`${id}.input`}
        className={`${input} ${jumpy ? "md:col-span-2" : "w-full"}`}
        defaultValue={name}
      />
    </div>
  );
}

export function Settings({ variant }: UiProps) {
  const jumpy = variant === "jumpy";
  return (
    <form data-anchor="sett" className={jumpy ? "space-y-6 p-4" : "flex flex-wrap items-start gap-8 p-4"}>
      {sections.map((s) => (
        <fieldset
          key={s.id}
          data-anchor={`sett.${s.id}`}
          className={`space-y-3 rounded-lg border border-gray-200 bg-white p-4 ${jumpy ? "" : "w-[358px]"}`}
        >
          <legend data-anchor={`sett.${s.id}.title`} className="px-1 text-sm font-semibold">
            {s.title}
          </legend>
          {s.fields.map((f) => (
            <Field key={f} section={s.id} name={f} jumpy={jumpy} />
          ))}
        </fieldset>
      ))}
      <div
        data-anchor="sett.actions"
        className={jumpy ? "flex flex-col gap-2 md:flex-row md:justify-end" : "flex w-[358px] gap-3"}
      >
        <button data-anchor="sett.cancel" type="button" className={`${input} ${jumpy ? "" : "w-28"}`}>
          Cancel
        </button>
        <button
          data-anchor="sett.save"
          type="button"
          className={`rounded bg-indigo-600 px-3 py-1.5 text-sm text-white ${jumpy ? "" : "w-28"}`}
        >
          Save
        </button>
      </div>
    </form>
  );
}
