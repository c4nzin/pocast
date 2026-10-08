using System.Reflection;
using Npgsql;

namespace Pocast.Library.Persistence;

public static class MigrationRunner
{
    private const long AdvisoryLockKey = 0x706f636173746c62;
    private const string ResourcePrefix = "Pocast.Library.Persistence.Migrations.";
    private const string ResourceSuffix = ".sql";

    public static async Task RunAsync(NpgsqlDataSource dataSource, ILogger logger, CancellationToken cancellationToken)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        await ExecuteAsync(connection, transaction, $"SELECT pg_advisory_xact_lock({AdvisoryLockKey})", cancellationToken);
        await ExecuteAsync(
            connection,
            transaction,
            "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
            cancellationToken);

        var applied = await ReadAppliedAsync(connection, transaction, cancellationToken);
        foreach (var (version, sql) in LoadMigrations().Where(migration => !applied.Contains(migration.Version)))
        {
            await ExecuteAsync(connection, transaction, sql, cancellationToken);
            await using var record = new NpgsqlCommand(
                "INSERT INTO schema_migrations (version) VALUES ($1)", connection, transaction);
            record.Parameters.AddWithValue(version);
            await record.ExecuteNonQueryAsync(cancellationToken);
            logger.LogInformation("Applied migration {Version}", version);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    internal static IReadOnlyList<(string Version, string Sql)> LoadMigrations()
    {
        var assembly = typeof(MigrationRunner).Assembly;
        return assembly.GetManifestResourceNames()
            .Where(name => name.StartsWith(ResourcePrefix, StringComparison.Ordinal)
                && name.EndsWith(ResourceSuffix, StringComparison.Ordinal))
            .Order(StringComparer.Ordinal)
            .Select(name => (name[ResourcePrefix.Length..^ResourceSuffix.Length], ReadResource(assembly, name)))
            .ToList();
    }

    private static string ReadResource(Assembly assembly, string name)
    {
        using var stream = assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException($"Missing migration resource {name}");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private static async Task<HashSet<string>> ReadAppliedAsync(
        NpgsqlConnection connection, NpgsqlTransaction transaction, CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand("SELECT version FROM schema_migrations", connection, transaction);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var versions = new HashSet<string>(StringComparer.Ordinal);
        while (await reader.ReadAsync(cancellationToken))
        {
            versions.Add(reader.GetString(0));
        }
        return versions;
    }

    private static async Task ExecuteAsync(
        NpgsqlConnection connection, NpgsqlTransaction transaction, string sql, CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
