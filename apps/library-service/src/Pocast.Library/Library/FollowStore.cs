using Npgsql;

namespace Pocast.Library.Library;

public sealed class FollowStore(NpgsqlDataSource dataSource, TimeProvider clock)
{
    private const string FollowSql = """
        WITH inserted AS (
            INSERT INTO follows (user_id, podcast_id, followed_at) VALUES ($1, $2, $3)
            ON CONFLICT (user_id, podcast_id) DO NOTHING
            RETURNING followed_at
        )
        SELECT followed_at FROM inserted
        UNION ALL
        SELECT followed_at FROM follows WHERE user_id = $1 AND podcast_id = $2
        LIMIT 1
        """;

    private const string FirstPageSql = """
        SELECT podcast_id, followed_at FROM follows
        WHERE user_id = $1
        ORDER BY followed_at DESC, podcast_id DESC
        LIMIT $2
        """;

    private const string NextPageSql = """
        SELECT podcast_id, followed_at FROM follows
        WHERE user_id = $1 AND (followed_at, podcast_id) < ($3, $4)
        ORDER BY followed_at DESC, podcast_id DESC
        LIMIT $2
        """;

    public async Task<FollowedPodcast> FollowAsync(FollowCommand command, CancellationToken cancellationToken)
    {
        var now = Timestamps.TruncateToMilliseconds(clock.GetUtcNow());
        await using var sql = dataSource.CreateCommand(FollowSql);
        sql.Parameters.AddWithValue(command.UserId);
        sql.Parameters.AddWithValue(command.PodcastId);
        sql.Parameters.AddWithValue(now);
        var followedAt = (DateTime)(await sql.ExecuteScalarAsync(cancellationToken))!;
        return new FollowedPodcast(command.PodcastId, Timestamps.ToIso(new DateTimeOffset(followedAt, TimeSpan.Zero)));
    }

    public async Task<OkResponse> UnfollowAsync(FollowCommand command, CancellationToken cancellationToken)
    {
        await using var sql = dataSource.CreateCommand("DELETE FROM follows WHERE user_id = $1 AND podcast_id = $2");
        sql.Parameters.AddWithValue(command.UserId);
        sql.Parameters.AddWithValue(command.PodcastId);
        await sql.ExecuteNonQueryAsync(cancellationToken);
        return new OkResponse(true);
    }

    public async Task<Page<FollowedPodcast>> ListAsync(PageCommand command, CancellationToken cancellationToken)
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

        var rows = new List<(Guid PodcastId, DateTimeOffset FollowedAt)>(limit + 1);
        await using var reader = await sql.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            rows.Add((reader.GetGuid(0), reader.GetFieldValue<DateTimeOffset>(1)));
        }

        var page = Cursor.ToPage(rows, limit, row => new Cursor(row.FollowedAt, row.PodcastId));
        return new Page<FollowedPodcast>(
            page.Items.Select(row => new FollowedPodcast(row.PodcastId, Timestamps.ToIso(row.FollowedAt))).ToList(),
            page.NextCursor);
    }
}
