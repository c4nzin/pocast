package app.pocast.creator.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("pocast.creator")
public record CreatorProperties(String queue, String catalogIngestQueue, Media media, Feed feed) {

	public record Media(
			String bucket,
			String region,
			String endpoint,
			String accessKeyId,
			String secretAccessKey,
			String publicBaseUrl,
			long maxUploadBytes,
			Duration uploadUrlTtl) {
	}

	public record Feed(String publicBaseUrl) {
	}
}
