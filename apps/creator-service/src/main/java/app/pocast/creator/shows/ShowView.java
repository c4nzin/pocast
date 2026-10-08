package app.pocast.creator.shows;

import java.util.UUID;

public record ShowView(
		UUID id,
		String title,
		String description,
		String author,
		String language,
		String categorySlug,
		boolean explicit,
		String imageUrl,
		String status,
		String feedUrl,
		String publishedAt,
		String createdAt,
		String updatedAt) {
}
