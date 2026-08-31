var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    // @microsoft/signalr defaults withCredentials to true, so the cross-origin
    // request is credentialed and the policy must opt into credentials.
    options.AddPolicy("client", policy => policy.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod().AllowCredentials());
});
builder.Services.AddSignalR();

var app = builder.Build();
app.UseCors("client");
app.MapHub<PresenceHub>("/hubs/presence");

app.Run("http://localhost:5000");
