# Relay server

A reference room-broadcast relay for the demo. It is not a production service: it exists so the quick start and `apps/demo` have a real WebSocket endpoint to connect to.

## Run

```sh
cd apps/server
bun run dev
```

The relay listens on port `8787` by default and upgrades WebSocket connections at `/`. It groups sockets into rooms by the `room` query parameter (`?room=main`) or the URL path, and forwards every inbound message to the other sockets in the same room.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | The port the relay listens on. |
| `RELAY_ALLOWED_ORIGINS` | unset (no check) | Comma-separated list of allowed `Origin` header values. When unset, every origin is accepted. |
| `RELAY_AUTH_TOKEN` | unset (no check) | When set, every upgrade must carry a matching `token` query parameter, or the relay closes the socket with code `4006`. |
| `MAX_MESSAGE_BYTES` | `32768` | Maximum size of one inbound message, in bytes. Oversized messages are dropped. |
| `RATE_CAPACITY` | `40` | Token-bucket capacity for the per-socket rate limit. |
| `RATE_REFILL_PER_SECOND` | `20` | Tokens added to each socket's bucket per second. |
| `RELAY_MAX_ROOM_SOCKETS` | `128` | Maximum sockets in one room. Beyond this, new sockets are refused with code `4001`. |
| `RELAY_MAX_TOTAL_SOCKETS` | `10000` | Maximum sockets across all rooms. Beyond this, new sockets are refused with code `4002`. |
| `RELAY_SLOW_PEER_SOFT_BYTES` | `1048576` | Buffered-bytes threshold above which the relay starts skipping sends to a slow peer. |
| `RELAY_SLOW_PEER_HARD_BYTES` | `8388608` | Buffered-bytes threshold above which the relay closes a slow peer with code `4003`. |
| `RELAY_SLOW_PEER_RESUME_BYTES` | `524288` | Buffered-bytes threshold below which the relay resumes sending to a previously skipped peer. |

## Defaults are open

Out of the box, with no environment variables set, the relay accepts connections from any origin and requires no token. It does not terminate TLS itself, and it tracks no per-IP connection cap — only the per-room and total-socket caps above. Set `RELAY_ALLOWED_ORIGINS` and `RELAY_AUTH_TOKEN` before exposing the relay beyond local development, and put it behind a TLS-terminating proxy.
