package app.pocast.creator.rpc;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.util.Comparator;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class CommandReader {

	private final JsonMapper mapper;
	private final Validator validator;

	public CommandReader(Validator validator) {
		this.validator = validator;
		this.mapper = RpcJson.mapper().rebuild()
				.enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
				.enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
				.build();
	}

	public <T> T read(JsonNode data, Class<T> type) {
		if (data == null || data.isNull() || data.isMissingNode()) {
			throw RpcException.badRequest("Payload is required");
		}
		T command;
		try {
			command = mapper.treeToValue(data, type);
		}
		catch (JacksonException error) {
			throw RpcException.badRequest(describe(error));
		}

		var violations = validator.validate(command);
		if (!violations.isEmpty()) {
			throw RpcException.badRequest(violations.stream()
					.sorted(Comparator.comparing(violation -> violation.getPropertyPath().toString()))
					.map(CommandReader::format)
					.collect(Collectors.joining(", ")));
		}
		return command;
	}

	private static String format(ConstraintViolation<?> violation) {
		return violation.getPropertyPath() + " " + violation.getMessage();
	}

	private static String describe(JacksonException error) {
		var path = error.getPath().stream()
				.map(reference -> reference.getPropertyName() != null
						? reference.getPropertyName()
						: String.valueOf(reference.getIndex()))
				.collect(Collectors.joining("."));
		return path.isBlank() ? "Invalid payload" : "Invalid value at " + path;
	}
}
