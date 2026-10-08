using System.Data.Common;
using Npgsql;

namespace Pocast.Library.Library;

public sealed class ProgressStore(NpgsqlDataSource dataSource, TimeProvider clock)
{
    private const string Columns = "episode_id, podcast_id, position_seconds, duration_seconds, completed, played_at";

    private const string SaveSql = $"""
        WITH saved AS (
            INSERT INTO playback_progress
                (user_id, episode_id, podcast_id, position_seconds, duration_seconds, completed, played_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (user_id, episode_id) DO UPDATE SET
                podcast_id = EXCLUDED.podcast_id,
                position_seconds = EXCLUDED.position_seconds,
                duration_seconds = COALESCE(EXCLUDED.duration_seconds, playback_progress.duration_seconds),
                completed = EXCLUDED.completed,
                played_at = EXCLUDED.played_at,
                updated_at = EXCLUDED.updated_at
            WHERE playback_progress.played_at <= EXCLUDED.played_at
            RETURNING {Columns}
        )
        SELECT {Columns} FROM saved
        UNION ALL
        SELECT {Columns} FROM playback_progress WHERE user_id = $1 AND episode_id = $2
        LIMIT 1
        """;

    private const string GetSql = $"""
        SELECT {Columns} FROM playback_progress
        WHERE user_id = $1 AND episode_id = ANY($2)
        """;

    private const string FirstPageSql = $"""
        SELECT {Columns} FROM playback_progress
        WHERE user_id = $1 AND NOT completed
        ORDER BY played_at DESC, episode_id DESC
        LIMIT $2
        """;

    private const string NextPageSql = $"""
        SELECT {Columns} FROM playback_progress
        WHERE user_id = $1 AND NOT completed AND (played_at, episode_id) < ($3, $4)
        ORDER BY played_at DESC, episode_id DESC
        LIMIT $2
        """;

    public async Task<EpisodeProgress> SaveAsync(SaveProgressCommand command, CancellationToken cancellationToken)
    {
        var now = Timestamps.TruncateToMilliseconds(clock.GetUtcNow());
        var playedAt = Timestamps.TruncateToMilliseconds(command.PlayedAt < now ? command.PlayedAt : now);
        var position = command.DurationSeconds is int duration
            ? Math.Min(command.PositionSeconds, duration)
            : command.PositionSeconds;

        await using var sql = dataSource.CreateCommand(SaveSql);
        sql.Parameters.AddWithValue(command.UserId);
        sql.Parameters.AddWithValue(command.EpisodeId);
        sql.Parameters.AddWithValue(command.PodcastId);
        sql.Parameters.AddWithValue(position);
        sql.Parameters.Add(new NpgsqlParameter<int?> { TypedValue = command.DurationSeconds, NpgsqlDbType = NpgsqlTypes.NpgsqlDbType.Integer });
        sql.Parameters.AddWithValue(command.Completed);
        sql.Parameters.AddWithValue(playedAt);
        sql.Parameters.AddWithValue(now);

        await using var reader = await sql.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        return ReadProgress(reader);
    }

    public async Task<IReadOnlyList<EpisodeProgress>> GetAsync(GetProgressCommand command, CancellationToken cancellationToken)
    {
        await using var sql = dataSource.CreateCommand(GetSql);
        sql.Parameters.AddWithValue(command.UserId);
        sql.Parameters.AddWithValue(command.EpisodeIds.Distinct().ToArray());
        return await ReadAllAsync(sql, command.EpisodeIds.Count, cancellationToken);
    }

    public async Task<Page<EpisodeProgress>> ListInProgressAsync(PageCommand command, CancellationToken cancellationToken)
    {
        var cursor = Cursor.Decode(command.Cursor);
        var limit = command.Limit ?? LibraryLimits.PageDefaultLimit;

        await using var sql = dataSource.CreateCommand(cursor is null ? FirstPageSql : NextPageSql);
        sql.Parameters.AddWithValue(command.UserId);
        sql.Parameters.AddWithValue(limit + 1);
        if (cursor is not null)
        {
            sql.Parameters.AddWithValue(cursor.At);
            sql.Parameters.AddWithValue(cursor.Id);
        }

        var rows = await ReadAllAsync(sql, limit + 1, cancellationToken);
        return Cursor.ToPage(rows, limit, row => new Cursor(DateTimeOffset.Parse(row.PlayedAt, System.Globalization.CultureInfo.InvariantCulture), row.EpisodeId));
    }

    private static async Task<IReadOnlyList<EpisodeProgress>> ReadAllAsync(
        NpgsqlCommand sql, int capacity, CancellationToken cancellationToken)
    {
        var rows = new List<EpisodeProgress>(capacity);
        await using var reader = await sql.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add(ReadProgress(reader));
        }
        return rows;
    }

    private static EpisodeProgress ReadProgress(DbDataReader reader) => new(
        reader.GetGuid(0),
        reader.GetGuid(1),
        reader.GetInt32(2),
        reader.IsDBNull(3) ? null : reader.GetInt32(3),
        reader.GetBoolean(4),
        Timestamps.ToIso(reader.GetFieldValue<DateTimeOffset>(5)));
}
