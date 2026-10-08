package app.pocast.creator.media;

import app.pocast.creator.config.CreatorProperties;
import java.time.Instant;
import java.util.Optional;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

@Component
public class MediaStorage {

	private static final int NOT_FOUND = 404;

	private final S3Client s3;
	private final S3Presigner presigner;
	private final CreatorProperties.Media settings;

	public MediaStorage(S3Client s3, S3Presigner presigner, CreatorProperties properties) {
		this.s3 = s3;
		this.presigner = presigner;
		this.settings = properties.media();
	}

	public record PresignedUpload(String url, String method, String contentType, Instant expiresAt) {
	}

	public record StoredObject(long sizeBytes, String contentType) {
	}

	public long maxUploadBytes() {
		return settings.maxUploadBytes();
	}

	public PresignedUpload presignUpload(String key, String contentType, long sizeBytes) {
		var put = PutObjectRequest.builder()
				.bucket(settings.bucket())
				.key(key)
				.contentType(contentType)
				.contentLength(sizeBytes)
				.build();
		var presigned = presigner.presignPutObject(PutObjectPresignRequest.builder()
				.signatureDuration(settings.uploadUrlTtl())
				.putObjectRequest(put)
				.build());
		return new PresignedUpload(presigned.url().toString(), "PUT", contentType, presigned.expiration());
	}

	public Optional<StoredObject> head(String key) {
		try {
			var head = s3.headObject(HeadObjectRequest.builder().bucket(settings.bucket()).key(key).build());
			return Optional.of(new StoredObject(head.contentLength(), head.contentType()));
		}
		catch (NoSuchKeyException error) {
			return Optional.empty();
		}
		catch (S3Exception error) {
			if (error.statusCode() == NOT_FOUND) {
				return Optional.empty();
			}
			throw error;
		}
	}

	public String publicUrl(String key) {
		return key == null ? null : settings.publicBaseUrl() + "/" + key;
	}
}
