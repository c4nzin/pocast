package app.pocast.creator.shows;

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
@Table(name = "shows")
public class Show {

	@Id
	@UuidGenerator(style = UuidGenerator.Style.VERSION_7)
	private UUID id;

	@Column(name = "owner_id", nullable = false, updatable = false)
	private UUID ownerId;

	@Column(nullable = false)
	private String title;

	@Column(nullable = false, columnDefinition = "text")
	private String description;

	private String author;

	@Column(nullable = false)
	private String language;

	@Column(name = "category_slug", nullable = false)
	private String categorySlug;

	@Column(name = "category_name", nullable = false)
	private String categoryName;

	@Column(name = "category_parent_name")
	private String categoryParentName;

	@Column(nullable = false)
	private boolean explicit;

	@Column(name = "image_url", columnDefinition = "text")
	private String imageUrl;

	@Column(name = "pending_image_key", columnDefinition = "text")
	private String pendingImageKey;

	@Column(name = "pending_image_type")
	private String pendingImageType;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private PublishStatus status = PublishStatus.DRAFT;

	@Column(name = "published_at")
	private Instant publishedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Show() {
	}

	public static Show create(ShowCommands.CreateShow command, Instant now) {
		var show = new Show();
		show.ownerId = command.userId();
		show.title = command.title();
		show.description = command.description();
		show.author = command.author();
		show.language = command.language();
		show.applyCategory(command.category());
		show.explicit = command.explicit();
		show.createdAt = now;
		show.updatedAt = now;
		return show;
	}

	public void update(ShowCommands.UpdateShow command, Instant now) {
		if (command.title() != null) {
			title = command.title();
		}
		if (command.description() != null) {
			description = command.description();
		}
		if (command.author() != null) {
			author = command.author();
		}
		if (command.language() != null) {
			language = command.language();
		}
		if (command.category() != null) {
			applyCategory(command.category());
		}
		if (command.explicit() != null) {
			explicit = command.explicit();
		}
		updatedAt = now;
	}

	public void publish(Instant now) {
		status = PublishStatus.PUBLISHED;
		if (publishedAt == null) {
			publishedAt = now;
		}
		updatedAt = now;
	}

	public void startArtworkUpload(String key, String contentType, Instant now) {
		pendingImageKey = key;
		pendingImageType = contentType;
		updatedAt = now;
	}

	public void attachArtwork(String url, Instant now) {
		imageUrl = url;
		pendingImageKey = null;
		pendingImageType = null;
		updatedAt = now;
	}

	public String getPendingImageKey() {
		return pendingImageKey;
	}

	public String getPendingImageType() {
		return pendingImageType;
	}

	public boolean isPublished() {
		return status == PublishStatus.PUBLISHED;
	}

	private void applyCategory(ShowCommands.Category category) {
		categorySlug = category.slug();
		categoryName = category.name();
		categoryParentName = category.parentName();
	}

	public UUID getId() {
		return id;
	}

	public UUID getOwnerId() {
		return ownerId;
	}

	public String getTitle() {
		return title;
	}

	public String getDescription() {
		return description;
	}

	public String getAuthor() {
		return author;
	}

	public String getLanguage() {
		return language;
	}

	public String getCategorySlug() {
		return categorySlug;
	}

	public String getCategoryName() {
		return categoryName;
	}

	public String getCategoryParentName() {
		return categoryParentName;
	}

	public boolean isExplicit() {
		return explicit;
	}

	public String getImageUrl() {
		return imageUrl;
	}

	public PublishStatus getStatus() {
		return status;
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
