package app.pocast.creator.feed;

import app.pocast.creator.common.PublishStatus;
import app.pocast.creator.common.Timestamps;
import app.pocast.creator.episodes.EpisodeRepository;
import app.pocast.creator.media.MediaStorage;
import app.pocast.creator.rpc.RpcException;
import app.pocast.creator.shows.ShowRepository;
import app.pocast.creator.shows.ShowService;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FeedService {

	public static final int FEED_EPISODE_LIMIT = 300;

	private final ShowRepository shows;
	private final EpisodeRepository episodes;
	private final ShowService showService;
	private final MediaStorage storage;

	public FeedService(ShowRepository shows, EpisodeRepository episodes, ShowService showService, MediaStorage storage) {
		this.shows = shows;
		this.episodes = episodes;
		this.showService = showService;
		this.storage = storage;
	}

	public record FeedRequest(@NotNull UUID showId) {
	}

	public record FeedDocument(String xml, String updatedAt) {
	}

	@Transactional(readOnly = true)
	public FeedDocument render(FeedRequest request) {
		var show = shows.findByIdAndStatus(request.showId(), PublishStatus.PUBLISHED)
				.orElseThrow(() -> RpcException.notFound("Feed " + request.showId() + " not found"));
		var items = episodes.findByShowIdAndStatusOrderByPublishedAtDesc(
				show.getId(), PublishStatus.PUBLISHED, Limit.of(FEED_EPISODE_LIMIT));
		var xml = RssFeedWriter.write(show, items, showService.feedUrl(show.getId()), storage::publicUrl);
		return new FeedDocument(xml, Timestamps.iso(show.getUpdatedAt()));
	}
}
