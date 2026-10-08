using Pocast.Library.Rpc;

namespace Pocast.Library.Library;

public static class LibraryHandlers
{
    public static IReadOnlyDictionary<string, RpcHandler> Create(FollowStore follows, ProgressStore progress) =>
        new Dictionary<string, RpcHandler>(StringComparer.Ordinal)
        {
            [LibraryPatterns.Follow] = async (data, ct) =>
                await follows.FollowAsync(RpcJson.ReadCommand<FollowCommand>(data), ct),
            [LibraryPatterns.Unfollow] = async (data, ct) =>
                await follows.UnfollowAsync(RpcJson.ReadCommand<FollowCommand>(data), ct),
            [LibraryPatterns.ListFollows] = async (data, ct) =>
                await follows.ListAsync(RpcJson.ReadCommand<PageCommand>(data), ct),
            [LibraryPatterns.SaveProgress] = async (data, ct) =>
                await progress.SaveAsync(RpcJson.ReadCommand<SaveProgressCommand>(data), ct),
            [LibraryPatterns.GetProgress] = async (data, ct) =>
                await progress.GetAsync(RpcJson.ReadCommand<GetProgressCommand>(data), ct),
            [LibraryPatterns.ListInProgress] = async (data, ct) =>
                await progress.ListInProgressAsync(RpcJson.ReadCommand<PageCommand>(data), ct),
        };
}
