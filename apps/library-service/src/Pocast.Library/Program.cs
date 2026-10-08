using Npgsql;
using Pocast.Library.Configuration;
using Pocast.Library.Library;
using Pocast.Library.Persistence;
using Pocast.Library.Rpc;

var isMigration = args.Contains("migrate");
var settings = LibrarySettings.FromEnvironment(useTestDatabase: args.Contains("--test"));

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddSingleton(settings);
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(settings.DatabaseConnectionString));
builder.Services.AddSingleton<FollowStore>();
builder.Services.AddSingleton<ProgressStore>();
builder.Services.AddSingleton(provider => new RpcRouter(
    LibraryHandlers.Create(provider.GetRequiredService<FollowStore>(), provider.GetRequiredService<ProgressStore>()),
    provider.GetRequiredService<ILogger<RpcRouter>>()));
if (!isMigration)
{
    builder.Services.AddHostedService<RabbitRpcServer>();
}

using var host = builder.Build();

if (isMigration)
{
    var logger = host.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Migrations");
    await MigrationRunner.RunAsync(host.Services.GetRequiredService<NpgsqlDataSource>(), logger, CancellationToken.None);
    return;
}

await host.RunAsync();
