using System.Text.Json;
using System.Text.Json.Nodes;

namespace Pocast.Library.Rpc;

public delegate Task<object> RpcHandler(JsonElement data, CancellationToken cancellationToken);

public sealed class RpcRouter(IReadOnlyDictionary<string, RpcHandler> handlers, ILogger<RpcRouter> logger)
{
    public const string NoHandlerMessage = "There is no matching message handler defined in the remote service.";

    public async Task<byte[]> DispatchAsync(ReadOnlyMemory<byte> body, CancellationToken cancellationToken)
    {
        string? id = null;
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            id = root.TryGetProperty("id", out var idElement) && idElement.ValueKind == JsonValueKind.String
                ? idElement.GetString()
                : null;
            var pattern = root.TryGetProperty("pattern", out var patternElement) ? ReadPattern(patternElement) : null;

            if (pattern is null || !handlers.TryGetValue(pattern, out var handler))
            {
                return Failure(id, 404, NoHandlerMessage);
            }

            var data = root.TryGetProperty("data", out var dataElement) ? dataElement : default;
            var response = await handler(data, cancellationToken);
            return Reply(id, null, JsonSerializer.SerializeToNode(response, response.GetType(), RpcJson.Options));
        }
        catch (RpcException error)
        {
            return Failure(id, error.StatusCode, error.Message);
        }
        catch (JsonException)
        {
            return Failure(id, 400, "Malformed message");
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            logger.LogError(error, "Unhandled RPC failure");
            return Failure(id, 500, "Internal server error");
        }
    }

    private static string? ReadPattern(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString(),
        JsonValueKind.Object => element.GetRawText(),
        _ => null,
    };

    private static byte[] Failure(string? id, int statusCode, string message) =>
        Reply(id, new JsonObject { ["statusCode"] = statusCode, ["message"] = message }, null);

    private static byte[] Reply(string? id, JsonNode? err, JsonNode? response) =>
        JsonSerializer.SerializeToUtf8Bytes(
            new JsonObject { ["id"] = id, ["err"] = err, ["response"] = response, ["isDisposed"] = true },
            RpcJson.Options);
}
