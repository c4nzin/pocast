package app.pocast.creator.config;

import java.net.URI;
import java.time.Clock;
import org.springframework.amqp.core.Queue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

@Configuration(proxyBeanMethods = false)
public class InfrastructureConfig {

	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}

	@Bean
	Queue creatorQueue(CreatorProperties properties) {
		return new Queue(properties.queue(), true);
	}

	@Bean(destroyMethod = "close")
	S3Client s3Client(CreatorProperties properties) {
		var media = properties.media();
		var builder = S3Client.builder()
				.httpClient(UrlConnectionHttpClient.create())
				.region(Region.of(media.region()))
				.credentialsProvider(credentials(media))
				.serviceConfiguration(s3Configuration(media));
		if (hasEndpoint(media)) {
			builder.endpointOverride(URI.create(media.endpoint()));
		}
		return builder.build();
	}

	@Bean(destroyMethod = "close")
	S3Presigner s3Presigner(CreatorProperties properties) {
		var media = properties.media();
		var builder = S3Presigner.builder()
				.region(Region.of(media.region()))
				.credentialsProvider(credentials(media))
				.serviceConfiguration(s3Configuration(media));
		if (hasEndpoint(media)) {
			builder.endpointOverride(URI.create(media.endpoint()));
		}
		return builder.build();
	}

	private static boolean hasEndpoint(CreatorProperties.Media media) {
		return media.endpoint() != null && !media.endpoint().isBlank();
	}

	private static S3Configuration s3Configuration(CreatorProperties.Media media) {
		return S3Configuration.builder().pathStyleAccessEnabled(hasEndpoint(media)).build();
	}

	private static AwsCredentialsProvider credentials(CreatorProperties.Media media) {
		if (media.accessKeyId() == null || media.accessKeyId().isBlank()) {
			return DefaultCredentialsProvider.builder().build();
		}
		return StaticCredentialsProvider.create(AwsBasicCredentials.create(media.accessKeyId(), media.secretAccessKey()));
	}
}
