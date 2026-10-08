package app.pocast.creator.rpc;

import tools.jackson.databind.json.JsonMapper;

public final class RpcJson {

	private static final JsonMapper MAPPER = JsonMapper.builder().build();

	private RpcJson() {
	}

	public static JsonMapper mapper() {
		return MAPPER;
	}
}
