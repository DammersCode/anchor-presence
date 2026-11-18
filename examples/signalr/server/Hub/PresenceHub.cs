using System.Text.RegularExpressions;
using Microsoft.AspNetCore.SignalR;

// Dumb relay: forwards PresenceReceived to the caller's room group, never parses the payload.
public partial class PresenceHub : Hub
{
    [GeneratedRegex("^[A-Za-z0-9_-]{1,256}\\z")]
    private static partial Regex RoomNamePattern();

    // A missing room is "main". A name with other characters is null: refuse the connection, never merge it into "main".
    private static string? RoomFor(HttpContext? context)
    {
        var values = context?.Request.Query["room"];
        if (values is { Count: > 1 }) return null;
        var candidate = values?.ToString();
        if (string.IsNullOrEmpty(candidate)) return "main";
        return RoomNamePattern().IsMatch(candidate) ? candidate : null;
    }

    public override async Task OnConnectedAsync()
    {
        var room = RoomFor(Context.GetHttpContext());
        if (room is null)
        {
            await Clients.Caller.SendAsync("Refused", 4007, "invalid room");
            Context.Abort();
            return;
        }
        await Groups.AddToGroupAsync(Context.ConnectionId, room);
        await base.OnConnectedAsync();
    }

    public Task OnPresence(string payload)
    {
        var room = RoomFor(Context.GetHttpContext());
        return room is null ? Task.CompletedTask : Clients.OthersInGroup(room).SendAsync("PresenceReceived", payload);
    }
}
