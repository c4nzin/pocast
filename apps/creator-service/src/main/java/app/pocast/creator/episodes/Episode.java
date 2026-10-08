package app.pocast.creator.episodes;

import app.pocast.creator.common.PublishStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "episodes")
public class Episode {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	@Column(name = "show_id", nullable = false, updatable = false)
	private UUID showId;

	@Column(nullable = false)
	private String title;

	@Column(nullable = false, columnDefinition = "text")
	private String description;

	@Enumerated(EnumType.STRING)
	@Column(name = "episode_type", nullable = false)
	private EpisodeType episodeType;

	@Column(name = "season_number")
	private Integer seasonNumber;

	@Column(name = "episode_number")
	private Integer episodeNumber;

	@Column(nullable = false)
	private boolean explicit;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private PublishStatus status = PublishStatus.DRAFT;

	@Column(name = "pending_media_key", columnDefinition = "text")
	private String pendingMediaKey;

	@Column(name = "pending_media_type")
	private String pendingMediaType;

	@Column(name = "media_key", columnDefinition = "text")
	private String mediaKey;

	@Column(name = "media_content_type")
	private String mediaContentType;

	@Column(name = "media_size_bytes")
	private Long mediaSizeBytes;

	@Column(name = "duration_seconds")
	private Integer durationSeconds;

	@Column(name = "published_at")
	private Instant publishedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Episode() {
	}

	public static Episode create(EpisodeCommands.CreateEpisode command, Instant now) {
		var episode = new Episode();
		episode.showId = command.showId();
		episode.title = command.title();
		episode.description = command.description();
		episode.episodeType = EpisodeType.valueOf(command.episodeType());
		episode.seasonNumber = command.seasonNumber();
		episode.episodeNumber = command.episodeNumber();
		episode.explicit = command.explicit();
		episode.createdAt = now;
		episode.updatedAt = now;
		return episode;
	}

	public void startUpload(String key, String contentType, Instant now) {
		pendingMediaKey = key;
		pendingMediaType = contentType;
		updatedAt = now;
	}

	public void attachUploadedMedia(long sizeBytes, int durationSeconds, Instant now) {
		mediaKey = pendingMediaKey;
		mediaContentType = pendingMediaType;
		mediaSizeBytes = sizeBytes;
		this.durationSeconds = durationSeconds;
		pendingMediaKey = null;
		pendingMediaType = null;
		updatedAt = now;
	}

	public void publish(Instant now) {
		status = PublishStatus.PUBLISHED;
		if (publishedAt == null) {
			publishedAt = now;
		}
		updatedAt = now;
	}

	public boolean hasMedia() {
		return mediaKey != null;
	}

	public UUID getId() {
		return id;
	}

	public UUID getShowId() {
		return showId;
	}

	public String getTitle() {
		return title;
	}

	public String getDescription() {
		return description;
	}

	public EpisodeType getEpisodeType() {
		return episodeType;
	}

	public Integer getSeasonNumber() {
		return seasonNumber;
	}

	public Integer getEpisodeNumber() {
		return episodeNumber;
	}

	public boolean isExplicit() {
		return explicit;
	}

	public PublishStatus getStatus() {
		return status;
	}

	public String getPendingMediaKey() {
		return pendingMediaKey;
	}

	public String getPendingMediaType() {
		return pendingMediaType;
	}

	public String getMediaKey() {
		return mediaKey;
	}

	public String getMediaContentType() {
		return mediaContentType;
	}

	public Long getMediaSizeBytes() {
		return mediaSizeBytes;
	}

	public Integer getDurationSeconds() {
		return durationSeconds;
	}

	public Instant getPublishedAt() {
		return publishedAt;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}
}
