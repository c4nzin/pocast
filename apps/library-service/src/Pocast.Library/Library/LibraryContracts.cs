using System.ComponentModel.DataAnnotations;

namespace Pocast.Library.Library;

public static class LibraryPatterns
{
    public const string Follow = "library.follow.add";
    public const string Unfollow = "library.follow.remove";
    public const string ListFollows = "library.follow.list";
    public const string SaveProgress = "library.progress.save";
    public const string GetProgress = "library.progress.get";
    public const string ListInProgress = "library.progress.list";
}

public static class LibraryLimits
{
    public const int PageDefaultLimit = 20;
    public const int PageMaxLimit = 50;
    public const int CursorMaxLength = 200;
    public const int ProgressBatchMax = 100;
    public const int PositionMaxSeconds = 7 * 24 * 60 * 60;
}

public sealed record FollowCommand
{
    public required Guid UserId { get; init; }
    public required Guid PodcastId { get; init; }
}

public sealed record PageCommand
{
    public required Guid UserId { get; init; }

    [MaxLength(LibraryLimits.CursorMaxLength)]
    public string? Cursor { get; init; }

    [Range(1, LibraryLimits.PageMaxLimit)]
    public int? Limit { get; init; }
}

public sealed record SaveProgressCommand
{
    public required Guid UserId { get; init; }
    public required Guid EpisodeId { get; init; }
    public required Guid PodcastId { get; init; }

    [Range(0, LibraryLimits.PositionMaxSeconds)]
    public required int PositionSeconds { get; init; }

    [Range(1, LibraryLimits.PositionMaxSeconds)]
    public int? DurationSeconds { get; init; }

    public required bool Completed { get; init; }
    public required DateTimeOffset PlayedAt { get; init; }
}

public sealed record GetProgressCommand
{
    public required Guid UserId { get; init; }

    [MinLength(1)]
    [MaxLength(LibraryLimits.ProgressBatchMax)]
    public required IReadOnlyList<Guid> EpisodeIds { get; init; }
}

public sealed record FollowedPodcast(Guid PodcastId, string FollowedAt);

public sealed record EpisodeProgress(
    Guid EpisodeId,
    Guid PodcastId,
    int PositionSeconds,
    int? DurationSeconds,
    bool Completed,
    string PlayedAt);

public sealed record Page<T>(IReadOnlyList<T> Items, string? NextCursor);

public sealed record OkResponse(bool Ok);
