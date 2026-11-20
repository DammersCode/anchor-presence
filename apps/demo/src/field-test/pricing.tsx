import type { UiProps } from "./variant";

const plans = [
  { id: "free", name: "Free", price: "$0", perks: ["1 project", "Community help"] },
  { id: "pro", name: "Pro", price: "$19", perks: ["10 projects", "Email help", "Analytics"] },
  { id: "team", name: "Team", price: "$49", perks: ["Unlimited projects", "Priority help", "SSO"] },
];

function Plan({ plan, jumpy }: { plan: (typeof plans)[number]; jumpy: boolean }) {
  const id = `pric.plan:${plan.id}`;
  return (
    <div
      data-anchor={id}
      className={`flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 ${jumpy ? "" : "w-[358px]"}`}
    >
      <h3 data-anchor={`${id}.name`} className="font-semibold">
        {plan.name}
      </h3>
      <p data-anchor={`${id}.price`} className="text-3xl font-bold">
        {plan.price}
      </p>
      <ul data-anchor={`${id}.perks`} className="space-y-1 text-sm">
        {plan.perks.map((p) => (
          <li key={p} data-anchor={`${id}.perk:${p}`}>
            {p}
          </li>
        ))}
      </ul>
      <button
        data-anchor={`${id}.cta`}
        type="button"
        className={`mt-2 rounded bg-indigo-600 py-1.5 text-sm text-white ${jumpy ? "" : "w-32 self-start"}`}
      >
        Choose {plan.name}
      </button>
    </div>
  );
}

export function Pricing({ variant }: UiProps) {
  const jumpy = variant === "jumpy";
  return (
    <section data-anchor="pric" className="p-4">
      <header data-anchor="pric.toggle" className="mb-8 flex gap-2 text-sm">
        <button data-anchor="pric.monthly" type="button" className="w-24 rounded border px-3 py-1">
          Monthly
        </button>
        <button data-anchor="pric.yearly" type="button" className="w-24 rounded border px-3 py-1">
          Yearly
        </button>
      </header>
      <div
        data-anchor="pric.plans"
        className={jumpy ? "grid grid-cols-1 gap-4 md:grid-cols-3" : "flex flex-wrap gap-8"}
      >
        {plans.map((p) => (
          <Plan key={p.id} plan={p} jumpy={jumpy} />
        ))}
      </div>
      <p data-anchor="pric.note" className="mt-8 text-xs text-gray-500">
        Prices exclude tax.
      </p>
    </section>
  );
}
