using Npgsql;

namespace Pocast.Library.Library;

public sealed record HealthStatus(bool Ok);

public sealed class DatabaseHealth(NpgsqlDataSource dataSource)
{
    public async Task<HealthStatus> CheckAsync(CancellationToken cancellationToken)
    {
        await using var sql = dataSource.CreateCommand("SELECT 1");
        await sql.ExecuteScalarAsync(cancellationToken);
        return new HealthStatus(true);
    }
}
