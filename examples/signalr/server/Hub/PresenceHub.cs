using Microsoft.AspNetCore.SignalR;

// Dumb relay: forwards PresenceReceived to every other connection, never parses the payload.
public class PresenceHub : Hub
{
    public void OnPresence(string payload)
    {
        Clients.Others.SendAsync("PresenceReceived", payload);
    }
}
