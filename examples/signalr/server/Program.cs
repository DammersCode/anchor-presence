var builder = WebApplication.CreateBuilder(args);

// Configurable allowlist so this stays a relay you can point at a real client origin, not just localhost.
var allowedOrigins = (Environment.GetEnvironmentVariable("RELAY_ALLOWED_ORIGINS") ?? "http://localhost:5173")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options =>
{
    // @microsoft/signalr defaults withCredentials to true, so the cross-origin
    // request is credentialed and the policy must opt into credentials.
    options.AddPolicy("client", policy => policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials());
});
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 32 * 1024;
});

var app = builder.Build();

// CORS only guards browser reads. A WebSocket upgrade skips it, so refuse a foreign Origin on every request.
app.Use(async (context, next) =>
{
    var origin = context.Request.Headers.Origin.ToString();
    if (origin.Length > 0 && !allowedOrigins.Contains(origin, StringComparer.Ordinal))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }
    await next();
});

app.UseCors("client");
app.MapHub<PresenceHub>("/hubs/presence");

var url = Environment.GetEnvironmentVariable("ASPNETCORE_URLS") ?? "http://localhost:5000";
app.Run(url);
