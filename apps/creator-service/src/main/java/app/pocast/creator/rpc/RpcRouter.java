package app.pocast.creator.rpc;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

public final class RpcRouter {

	public static final String NO_HANDLER_MESSAGE = "There is no matching message handler defined in the remote service.";

	private static final Logger LOGGER = LoggerFactory.getLogger(RpcRouter.class);

	private final Map<String, RpcHandler> handlers;

	public RpcRouter(Map<String, RpcHandler> handlers) {
		this.handlers = Map.copyOf(handlers);
	}

	public byte[] dispatch(byte[] body) {
		String id = null;
		try {
			var root = RpcJson.mapper().readTree(body);
			id = root.path("id").isString() ? root.path("id").asString() : null;
			var handler = handlers.get(readPattern(root.path("pattern")));
			if (handler == null) {
				return failure(id, 404, NO_HANDLER_MESSAGE);
			}
			return reply(id, null, RpcJson.mapper().valueToTree(handler.handle(root.path("data"))));
		}
		catch (RpcException error) {
			return failure(id, error.statusCode(), error.getMessage());
		}
		catch (JacksonException error) {
			return failure(id, 400, "Malformed message");
		}
		catch (RuntimeException error) {
			LOGGER.error("Unhandled RPC failure", error);
			return failure(id, 500, "Internal server error");
		}
	}

	private static String readPattern(JsonNode pattern) {
		if (pattern.isString()) {
			return pattern.asString();
		}
		return pattern.isObject() ? pattern.toString() : "";
	}

	private static byte[] failure(String id, int statusCode, String message) {
		var err = RpcJson.mapper().createObjectNode().put("statusCode", statusCode).put("message", message);
		return reply(id, err, null);
	}

	private static byte[] reply(String id, JsonNode err, JsonNode response) {
		ObjectNode envelope = RpcJson.mapper().createObjectNode();
		envelope.put("id", id);
		envelope.set("err", err);
		envelope.set("response", response);
		envelope.put("isDisposed", true);
		return RpcJson.mapper().writeValueAsBytes(envelope);
	}
}
