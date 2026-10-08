package app.pocast.creator.shows;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public final class ShowCommands {

	public static final String LANGUAGE_TAG = "^[a-z]{2,3}(-[a-z0-9]{1,8})*$";
	public static final int TITLE_MAX = 255;
	public static final int DESCRIPTION_MAX = 4000;

	private ShowCommands() {
	}

	public record Category(
			@NotBlank @Size(max = 100) String slug,
			@NotBlank @Size(max = 100) String name,
			@Size(max = 100) String parentName) {
	}

	public record UserCommand(@NotNull UUID userId) {
	}

	public record ShowRef(@NotNull UUID userId, @NotNull UUID showId) {
	}

	public record CreateShow(
			@NotNull UUID userId,
			@NotBlank @Size(max = TITLE_MAX) String title,
			@NotBlank @Size(max = DESCRIPTION_MAX) String description,
			@Size(max = TITLE_MAX) String author,
			@NotNull @Pattern(regexp = LANGUAGE_TAG) String language,
			@NotNull @Valid Category category,
			boolean explicit) {
	}

	public record UpdateShow(
			@NotNull UUID userId,
			@NotNull UUID showId,
			@Size(min = 1, max = TITLE_MAX) String title,
			@Size(min = 1, max = DESCRIPTION_MAX) String description,
			@Size(max = TITLE_MAX) String author,
			@Pattern(regexp = LANGUAGE_TAG) String language,
			@Valid Category category,
			Boolean explicit) {
	}
}
