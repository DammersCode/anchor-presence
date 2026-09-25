using System.Text.RegularExpressions;
using Microsoft.AspNetCore.SignalR;

// Dumb relay: forwards PresenceReceived to the caller's room group, never parses the payload.
public partial class PresenceHub : Hub
{
    [GeneratedRegex("^[A-Za-z0-9_-]{1,256}$")]
    private static partial Regex RoomNamePattern();

    private static string RoomFor(HttpContext? context)
    {
        var candidate = context?.Request.Query["room"].ToString();
        return string.IsNullOrEmpty(candidate) || !RoomNamePattern().IsMatch(candidate) ? "main" : candidate;
    }

    public override async Task OnConnectedAsync()
    {
        var room = RoomFor(Context.GetHttpContext());
        await Groups.AddToGroupAsync(Context.ConnectionId, room);
        await base.OnConnectedAsync();
    }

    public Task OnPresence(string payload)
    {
        var room = RoomFor(Context.GetHttpContext());
        return Clients.OthersInGroup(room).SendAsync("PresenceReceived", payload);
    }
}
