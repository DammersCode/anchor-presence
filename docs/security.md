# Security

All inbound presence data is untrusted. This page lists the validation limits, explains why anchor IDs never touch selectors, states the rendering rule for user and context data, and covers `maxRemoteClients`.

## Validation limits

Every decoded message passes through `validatePresence()` before it reaches the store. A message or field that fails a rule is dropped.

| Field | Rule |
|---|---|
| `version` | must equal `1`, else the whole message is dropped |
| `clientId` | string, 1 to 128 characters, else dropped |
| `session` | string, 1 to 64 characters, else dropped |
| `sequence` | finite integer, 0 or greater, else dropped |
| `anchors` | array, max 8 entries, extra entries truncated |
| anchor `id` | string, 1 to 256 characters, else that entry is dropped |
| anchor `u`, `v` | finite number, clamped to `[0, 1]` |
| `viewport.u`, `viewport.v` | finite number, clamped to `[0, 1]` |
| `context` | max 8 KiB when JSON-encoded, else the field is dropped |
| `user` | max 8 KiB when JSON-encoded, else the field is dropped |
| whole message | max 32 KiB encoded, else the whole message is dropped |

These limits are constants in `@anchor-presence/core`, and every one is overridable through `ValidationLimits` passed to `validatePresence`, or through `PresenceClientOptions.validationLimits` on `createPresenceClient`.

A message with an invalid `version`, `clientId`, `session`, `sequence`, or `cursor` shape is dropped in full. A message with an oversized `context` or `user` field keeps the rest of the message and drops only that field.

Wire encoding for `context` and `user`: a missing field means "unchanged since the previous same-session message", and an explicit `null` clears the field. The store normalizes a cleared field to `undefined` in the receiver snapshot.

## Why anchor IDs never touch selectors

An anchor ID is an opaque string. The resolver looks it up as a plain object key in the registry's `Map<string, Element>`. It is never passed to `querySelector`, `eval`, a template engine, or any other code path that interprets a string as a program or a selector.

This means a malicious or malformed anchor ID from the network cannot make the receiver address any DOM location outside the set the application registered itself, no matter what string it contains (Invariant 8). The worst outcome from an unrecognized anchor ID is a lookup miss, which the fallback chain already treats as a normal case.

## Render user and context as text

`user` and `context` values are untrusted, even after validation passes. Validation checks size, not content; the field can hold attacker-controlled strings, numbers, or nested objects.

Render both fields as text: text nodes in plain DOM code, or framework text interpolation such as JSX's `{value}`. Never render them as HTML, and never pass them to `innerHTML`, `dangerouslySetInnerHTML`, or an equivalent.

```tsx
// correct: renders as text, no matter what the string contains
<span>{cursor.user?.name}</span>

// wrong: never do this with network-sourced data
<span dangerouslySetInnerHTML={{ __html: cursor.user?.name }} />
```

## maxRemoteClients

The remote presence store caps the number of distinct remote clients it tracks. `maxRemoteClients` defaults to 64, and is configurable through `PresenceClientOptions.maxRemoteClients` on `createPresenceClient`.

A message from a new `clientId` beyond the cap is dropped; existing clients are unaffected. This bounds every allocation driven by network data: store entries, resolved cursors, and observed anchors. Expiry and disconnects free slots for new clients as they occur.

Set `maxRemoteClients` to match your expected concurrent session count. A value far above real usage offers no benefit and only raises the worst-case cost of a flood of distinct `clientId` values.
