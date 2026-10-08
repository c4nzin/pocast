package app.pocast.creator.shows;

import app.pocast.creator.common.Timestamps;
import app.pocast.creator.config.CreatorProperties;
import app.pocast.creator.rpc.RpcException;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ShowService {

	public static final int MAX_SHOWS_PER_OWNER = 20;

	private final ShowRepository shows;
	private final Clock clock;
	private final String feedBaseUrl;

	public ShowService(ShowRepository shows, Clock clock, CreatorProperties properties) {
		this.shows = shows;
		this.clock = clock;
		this.feedBaseUrl = properties.feed().publicBaseUrl();
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
