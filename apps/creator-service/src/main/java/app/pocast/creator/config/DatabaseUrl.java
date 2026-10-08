package app.pocast.creator.config;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public final class DatabaseUrl {

	private static final int DEFAULT_PORT = 5432;

	private DatabaseUrl() {
	}

	public static Map<String, Object> toSpringProperties(String databaseUrl) {
		if (databaseUrl == null || databaseUrl.isBlank()) {
			throw new IllegalStateException("CREATOR_DATABASE_URL is not set");
		}
		var uri = URI.create(databaseUrl);
		if (!"postgresql".equals(uri.getScheme()) && !"postgres".equals(uri.getScheme())) {
			throw new IllegalStateException("CREATOR_DATABASE_URL must be a postgresql:// URL");
		}

		var properties = new HashMap<String, Object>();
		var port = uri.getPort() > 0 ? uri.getPort() : DEFAULT_PORT;
		var query = uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery();
		properties.put("spring.datasource.url", "jdbc:postgresql://" + uri.getHost() + ":" + port + uri.getRawPath() + query);

		var userInfo = uri.getRawUserInfo();
		if (userInfo != null) {
			var credentials = userInfo.split(":", 2);
			properties.put("spring.datasource.username", decode(credentials[0]));
			if (credentials.length > 1) {
				properties.put("spring.datasource.password", decode(credentials[1]));
			}
		}
		return properties;
	}

	private static String decode(String value) {
		return URLDecoder.decode(value, StandardCharsets.UTF_8);
	}
}
