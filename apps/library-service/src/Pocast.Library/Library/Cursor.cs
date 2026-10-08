using System.Buffers.Text;
using System.Globalization;
using System.Text.Json;
using Pocast.Library.Rpc;

namespace Pocast.Library.Library;

public sealed record Cursor(DateTimeOffset At, Guid Id)
{
    private sealed record Wire(string T, Guid I);

    public string Encode() =>
        Base64Url.EncodeToString(JsonSerializer.SerializeToUtf8Bytes(new Wire(Timestamps.ToIso(At), Id), RpcJson.Options));

    public static Cursor? Decode(string? raw)
    {
        if (string.IsNullOrEmpty(raw))
        {
            return null;
        }
        try
        {
            var wire = JsonSerializer.Deserialize<Wire>(Base64Url.DecodeFromChars(raw), RpcJson.Options);
            if (wire is null || !DateTimeOffset.TryParse(wire.T, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var at))
            {
                throw RpcException.BadRequest("Invalid cursor");
            }
            return new Cursor(at, wire.I);
        }
        catch (Exception error) when (error is FormatException or JsonException)
        {
            throw RpcException.BadRequest("Invalid cursor");
        }
    }

    public static Page<T> ToPage<T>(IReadOnlyList<T> rows, int limit, Func<T, Cursor> positionOf)
    {
        var items = rows.Take(limit).ToList();
        var nextCursor = rows.Count > limit && items.Count > 0 ? positionOf(items[^1]).Encode() : null;
        return new Page<T>(items, nextCursor);
    }
}

public static class Timestamps
{
    public static DateTimeOffset TruncateToMilliseconds(DateTimeOffset value) =>
        new(value.UtcTicks - value.UtcTicks % TimeSpan.TicksPerMillisecond, TimeSpan.Zero);

    public static string ToIso(DateTimeOffset value) =>
        value.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
