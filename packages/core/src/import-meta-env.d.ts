// Not in the entry graph, so this global declaration does not ship to consumers.
interface ImportMeta {
  readonly env?: { readonly DEV?: boolean };
}
