using Npgsql;

namespace Pocast.Library.Configuration;

public sealed record LibrarySettings(
    string RabbitMqUrl,
    string Queue,
    string DatabaseConnectionString,
    ushort Prefetch,
    ushort Concurrency)
{
    public const string LibraryQueue = "library_queue";
    public const string DefaultRabbitMqUrl = "amqp://guest:guest@localhost:5672";

    private const int DefaultPoolMax = 20;
    private const int DefaultPrefetch = 64;
    private const int DefaultConcurrency = 16;
    private const int DefaultPostgresPort = 5432;

    public static LibrarySettings FromEnvironment(bool useTestDatabase)
    {
        var databaseVariable = useTestDatabase ? "LIBRARY_TEST_DATABASE_URL" : "LIBRARY_DATABASE_URL";
        var databaseUrl = Environment.GetEnvironmentVariable(databaseVariable)
            ?? throw new InvalidOperationException($"{databaseVariable} is not set");

        return new LibrarySettings(
            Environment.GetEnvironmentVariable("RABBITMQ_URL") ?? DefaultRabbitMqUrl,
            LibraryQueue,
            ToNpgsqlConnectionString(databaseUrl, ReadPositive("LIBRARY_DB_POOL_MAX", DefaultPoolMax)),
            (ushort)ReadPositive("LIBRARY_PREFETCH", DefaultPrefetch),
            (ushort)ReadPositive("LIBRARY_CONCURRENCY", DefaultConcurrency));
    }

    public static string ToNpgsqlConnectionString(string databaseUrl, int poolMax)
    {
        if (!Uri.TryCreate(databaseUrl, UriKind.Absolute, out var uri)
            || (uri.Scheme != "postgresql" && uri.Scheme != "postgres"))
        {
            return new NpgsqlConnectionStringBuilder(databaseUrl) { MaxPoolSize = poolMax }.ConnectionString;
        }

        var credentials = uri.UserInfo.Split(':', 2);
        return new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : DefaultPostgresPort,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(credentials[0]),
            Password = credentials.Length > 1 ? Uri.UnescapeDataString(credentials[1]) : null,
            MaxPoolSize = poolMax,
        }.ConnectionString;
    }

    private static int ReadPositive(string name, int fallback)
    {
        var raw = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrEmpty(raw))
        {
            return fallback;
        }
        if (!int.TryParse(raw, out var value) || value <= 0 || value > ushort.MaxValue)
        {
            throw new InvalidOperationException($"{name} must be a positive integer, got \"{raw}\"");
        }
        return value;
    }
}
