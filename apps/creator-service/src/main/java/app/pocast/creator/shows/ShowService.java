package app.pocast.creator.shows;

import app.pocast.creator.catalog.CatalogSyncPublisher;
import app.pocast.creator.common.Timestamps;
import app.pocast.creator.config.CreatorProperties;
import app.pocast.creator.media.MediaStorage;
import app.pocast.creator.rpc.RpcException;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShowService {

	public static final int MAX_SHOWS_PER_OWNER = 20;

	private final ShowRepository shows;
	private final Clock clock;
	private final String feedBaseUrl;
	private final ApplicationEventPublisher events;
	private final MediaStorage storage;

	private static final Map<String, String> IMAGE_EXTENSIONS = Map.of("image/jpeg", "jpg", "image/png", "png");

	public ShowService(
			ShowRepository shows,
			Clock clock,
			CreatorProperties properties,
			ApplicationEventPublisher events,
			MediaStorage storage) {
		this.shows = shows;
		this.clock = clock;
		this.feedBaseUrl = properties.feed().publicBaseUrl();
		this.events = events;
		this.storage = storage;
	}

	@Transactional
	public MediaStorage.PresignedUpload requestArtworkUpload(ShowCommands.RequestArtworkUpload command) {
		var show = requireOwned(command.showId(), command.userId());
		var key = "shows/%s/artwork/%s.%s".formatted(
				show.getId(), UUID.randomUUID(), IMAGE_EXTENSIONS.get(command.contentType()));
		show.startArtworkUpload(key, command.contentType(), Timestamps.now(clock));
		return storage.presignUpload(key, command.contentType(), command.sizeBytes());
	}

	@Transactional
	public ShowView completeArtworkUpload(ShowCommands.ShowRef command) {
		var show = requireOwned(command.showId(), command.userId());
		if (show.getPendingImageKey() == null) {
			throw RpcException.conflict("No artwork upload was requested for this show");
		}
		var stored = storage.head(show.getPendingImageKey())
				.orElseThrow(() -> RpcException.conflict("Uploaded artwork was not found"));
		if (stored.sizeBytes() <= 0 || stored.sizeBytes() > ShowCommands.ARTWORK_MAX_BYTES) {
			throw RpcException.badRequest("Uploaded artwork size is not allowed");
		}
		if (!show.getPendingImageType().equals(stored.contentType())) {
			throw RpcException.badRequest("Uploaded artwork type does not match the requested type");
		}
		show.attachArtwork(storage.publicUrl(show.getPendingImageKey()), Timestamps.now(clock));
		if (show.isPublished()) {
			notifyCatalog(show);
		}
		return toView(show);
	}

	@Transactional
	public ShowView create(ShowCommands.CreateShow command) {
		if (shows.countByOwnerId(command.userId()) >= MAX_SHOWS_PER_OWNER) {
			throw RpcException.conflict("A creator can own at most " + MAX_SHOWS_PER_OWNER + " shows");
		}
		return toView(shows.save(Show.create(command, Timestamps.now(clock))));
	}

	@Transactional
	public ShowView update(ShowCommands.UpdateShow command) {
		var show = requireOwned(command.showId(), command.userId());
		show.update(command, Timestamps.now(clock));
		if (show.isPublished()) {
			notifyCatalog(show);
		}
		return toView(show);
	}

	@Transactional(readOnly = true)
	public ShowView get(ShowCommands.ShowRef command) {
		return toView(requireOwned(command.showId(), command.userId()));
	}

	@Transactional(readOnly = true)
	public List<ShowView> list(ShowCommands.UserCommand command) {
		return shows.findByOwnerIdOrderByCreatedAtDesc(command.userId(), Limit.of(MAX_SHOWS_PER_OWNER))
				.stream()
				.map(this::toView)
				.toList();
	}

	public Show requireOwned(UUID showId, UUID ownerId) {
		return shows.findByIdAndOwnerId(showId, ownerId)
				.orElseThrow(() -> RpcException.notFound("Show " + showId + " not found"));
	}

	public void notifyCatalog(Show show) {
		events.publishEvent(new CatalogSyncPublisher.ShowChanged(show.getId(), feedUrl(show.getId())));
	}

	public String feedUrl(UUID showId) {
		return feedBaseUrl + "/feeds/" + showId;
	}

	private ShowView toView(Show show) {
		return new ShowView(
				show.getId(),
				show.getTitle(),
				show.getDescription(),
				show.getAuthor(),
				show.getLanguage(),
				show.getCategorySlug(),
				show.isExplicit(),
				show.getImageUrl(),
				show.getStatus().name(),
				show.isPublished() ? feedUrl(show.getId()) : null,
				Timestamps.iso(show.getPublishedAt()),
				Timestamps.iso(show.getCreatedAt()),
				Timestamps.iso(show.getUpdatedAt()));
	}
}
