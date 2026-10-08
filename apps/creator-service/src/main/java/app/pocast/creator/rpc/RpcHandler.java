package app.pocast.creator.rpc;

import tools.jackson.databind.JsonNode;

@FunctionalInterface
public interface RpcHandler {

	Object handle(JsonNode data);
}
