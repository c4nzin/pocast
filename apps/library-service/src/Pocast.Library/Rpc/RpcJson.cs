using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Pocast.Library.Rpc;

public static class RpcJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        RespectNullableAnnotations = true,
        RespectRequiredConstructorParameters = true,
    };

    public static T ReadCommand<T>(JsonElement data) where T : class
    {
        T? command;
        try
        {
            command = data.ValueKind == JsonValueKind.Undefined ? null : data.Deserialize<T>(Options);
        }
        catch (JsonException error)
        {
            throw RpcException.BadRequest(error.Path is { Length: > 1 } path ? $"Invalid value at {path}" : "Invalid payload");
        }
        if (command is null)
        {
            throw RpcException.BadRequest("Payload is required");
        }

        var results = new List<ValidationResult>();
        if (!Validator.TryValidateObject(command, new ValidationContext(command), results, validateAllProperties: true))
        {
            throw RpcException.BadRequest(string.Join(", ", results.Select(result => result.ErrorMessage)));
        }
        return command;
    }
}
