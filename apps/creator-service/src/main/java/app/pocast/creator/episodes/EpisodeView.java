package app.pocast.creator.episodes;

import java.util.UUID;

public record EpisodeView(
		UUID id,
		UUID showId,
		String title,
		String description,
		String episodeType,
		Integer seasonNumber,
		Integer episodeNumber,
		boolean explicit,
		String status,
		String mediaUrl,
		String mediaContentType,
		Long mediaSizeBytes,
		Integer durationSeconds,
		String publishedAt,
		String createdAt,
		String updatedAt) {
}
