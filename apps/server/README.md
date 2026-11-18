# Relay server

This is the reference room-broadcast relay. It is not a production service. It gives `apps/demo` a real WebSocket endpoint on port `8787`, the default port of `createWebSocketTransport`. The quick start uses the Bun relay in `examples/bun-native` on port `8788` instead. A peer is another client in the same room. The relay forwards every inbound message to the peers of the sender.

## Run

Start the relay from this folder:

```sh
cd apps/server
bun run dev
```

The relay listens on port `8787`.

## Environment variables

| Variable                     | Default          | Meaning                                                                                                                                                                                                                                                                      |
| ---------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                       | `8787`           | The port of the relay.                                                                                                                                                                                                                                                       |
| `RELAY_ALLOWED_ORIGINS`      | unset (no check) | A comma-separated list of allowed `Origin` header values. If it is unset, the relay accepts every origin. A foreign origin closes with code `4004`.                                                                                                                          |
| `RELAY_AUTH_TOKEN`           | unset (no check) | If it is set, every upgrade must carry a matching `token` query parameter, the room token. Otherwise, the relay closes the socket with code `4006`.                                                                                                                          |
| `MAX_MESSAGE_BYTES`          | `32768`          | The maximum size of one inbound message, in bytes. The relay drops a larger message and keeps the socket open. A frame above the WebSocket payload limit (four times this size, at least 1 MiB) closes the socket of the sender.                                             |
| `RATE_CAPACITY`              | `80`             | The token-bucket capacity of the rate limit per socket.                                                                                                                                                                                                                      |
| `RATE_REFILL_PER_SECOND`     | `40`             | The tokens that the relay adds to the bucket of each socket per second.                                                                                                                                                                                                      |
| `RELAY_MAX_ROOM_SOCKETS`     | `64`             | The maximum sockets in one room. Above it, the relay closes a new socket with code `4001`.                                                                                                                                                                                   |
| `RELAY_MAX_TOTAL_SOCKETS`    | `10000`          | The maximum sockets in all rooms. Above it, the relay closes a new socket with code `4002`.                                                                                                                                                                                  |
| `RELAY_SLOW_PEER_SOFT_BYTES` | `1048576`        | Above this buffered size, the relay drops frames for a slow peer.                                                                                                                                                                                                            |
| `RELAY_SLOW_PEER_HARD_BYTES` | `8388608`        | Above this buffered size, the relay closes a slow peer with code `4003`. The relay drops frames above the soft size, so code `4003` occurs only when this value is below `RELAY_SLOW_PEER_SOFT_BYTES` plus `MAX_MESSAGE_BYTES`. With the defaults, code `4003` never occurs. |

The relay pings every socket every 30 seconds. It closes a socket with no pong for 60 seconds with code `4005`. With the default limits, a stalled peer ends this way: the relay drops its frames, and then closes it with code `4005`.

## Room names

The relay reads the room from the `room` query parameter (`/?room=main`). If the parameter is empty or missing, the relay reads the room from the URL path. It uses the full path without its leading and trailing slashes, so `/room-42` is the room `room-42`. A missing name is `main`.

A room name has letters, digits, `_` and `-`, up to 256 characters. The relay closes a socket with any other name with code `4007`. For this reason, a path with a second `/`, such as `/team/room-42`, closes with `4007`.

The example relays under `examples/` read the room from the `room` query parameter only.

## Identity

The relay has no `authCheck` hook and binds no identity. Any client in a room can claim any `clientId`. The relay checks only the shared room token of `RELAY_AUTH_TOKEN`. For identity binding, use an example relay with an `authCheck` hook.

## Defaults are open

By default, the relay accepts connections from every origin and needs no room token. It does not terminate TLS. It has no connection cap per IP, only the caps per room and in total.

Before you expose the relay outside local development, set `RELAY_ALLOWED_ORIGINS` and `RELAY_AUTH_TOKEN`. Put a proxy that serves TLS (`wss://`) in front of it. The room token travels in the query string, so it can appear in proxy and access logs. See [Security](https://anchor-presence.vercel.app/docs/get-started/guides/security#room-token).
