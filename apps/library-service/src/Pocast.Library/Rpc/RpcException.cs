namespace Pocast.Library.Rpc;

public sealed class RpcException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;

    public static RpcException BadRequest(string message) => new(400, message);
}
