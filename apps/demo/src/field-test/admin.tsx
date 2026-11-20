import type { UiProps } from "./variant";

const nav = ["Home", "Users", "Orders", "Reports", "Settings"];
const head = ["id", "name", "role", "status", "created"];
const users = Array.from({ length: 6 }, (_, i) => [
  `${100 + i}`,
  `User ${i + 1}`,
  i % 2 ? "Admin" : "Editor",
  "Active",
  "2026-01-0" + (i + 1),
]);

export function Admin({ variant }: UiProps) {
  const jumpy = variant === "jumpy";
  return (
    <div
      data-anchor="admi"
      className={jumpy ? "flex min-h-screen flex-col md:flex-row" : "flex flex-wrap items-start gap-8 p-4"}
    >
      <nav
        data-anchor="admi.nav"
        className={`bg-gray-900 p-2 text-sm text-white ${jumpy ? "flex w-full flex-wrap md:block md:w-12 md:space-y-1 lg:w-48" : "flex w-[358px] flex-wrap gap-2 rounded-lg"}`}
      >
        {nav.map((n) => (
          <a
            key={n}
            data-anchor={`admi.nav:${n.toLowerCase()}`}
            className={`block rounded px-2 py-1.5 ${jumpy ? "" : "size-16 text-center text-xs"}`}
          >
            <span className={jumpy ? "hidden lg:inline" : ""}>{n}</span>
            {jumpy && <span className="lg:hidden">{n[0]}</span>}
          </a>
        ))}
      </nav>
      <div
        data-anchor="admi.table"
        className={`overflow-x-auto bg-white p-3 ${jumpy ? "flex-1" : "w-[358px] rounded-lg"}`}
      >
        <div data-anchor="admi.toolbar" className="mb-2 flex gap-2">
          <input
            data-anchor="admi.search"
            className="w-40 rounded border px-2 py-1 text-sm"
            placeholder="Search"
          />
          <button
            data-anchor="admi.add"
            type="button"
            className="w-20 rounded bg-indigo-600 py-1 text-sm text-white"
          >
            Add
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th
                  key={h}
                  data-anchor={`admi.col:${h}`}
                  className={`py-1 pr-4 ${jumpy && i > 2 ? "hidden md:table-cell" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((r) => (
              <tr key={r[0]} data-anchor={`admi.row:${r[0]}`}>
                {r.map((c, i) => (
                  <td
                    key={head[i]}
                    data-anchor={`admi.cell:${r[0]}.${head[i]}`}
                    className={`whitespace-nowrap py-1 pr-4 ${jumpy && i > 2 ? "hidden md:table-cell" : ""}`}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
