package app.pocast.creator.episodes;

import app.pocast.creator.shows.ShowCommands;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public final class EpisodeCommands {

	public static final String EPISODE_TYPES = "^(FULL|TRAILER|BONUS)$";
	public static final String AUDIO_TYPES = "^audio/(mpeg|mp4|x-m4a|aac|ogg)$";
	public static final int DURATION_MAX_SECONDS = 7 * 24 * 60 * 60;

	private EpisodeCommands() {
	}

	public record EpisodeRef(@NotNull UUID userId, @NotNull UUID episodeId) {
	}

	public record CreateEpisode(
			@NotNull UUID userId,
			@NotNull UUID showId,
			@NotBlank @Size(max = ShowCommands.TITLE_MAX) String title,
			@NotBlank @Size(max = ShowCommands.DESCRIPTION_MAX) String description,
			@NotNull @Pattern(regexp = EPISODE_TYPES) String episodeType,
			@Positive Integer seasonNumber,
			@Positive Integer episodeNumber,
			boolean explicit) {
	}

	public record RequestUpload(
			@NotNull UUID userId,
			@NotNull UUID episodeId,
			@NotNull @Pattern(regexp = AUDIO_TYPES) String contentType,
			@Positive long sizeBytes) {
	}

	public record CompleteUpload(
			@NotNull UUID userId,
			@NotNull UUID episodeId,
			@Positive @Max(DURATION_MAX_SECONDS) int durationSeconds) {
	}
}
