package app.pocast.creator.episodes;

import app.pocast.creator.common.Timestamps;
import app.pocast.creator.media.MediaStorage;
import app.pocast.creator.rpc.RpcException;
import app.pocast.creator.shows.ShowCommands;
import app.pocast.creator.shows.ShowService;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EpisodeService {

	public static final int MAX_EPISODES_PER_SHOW = 5000;
	public static final int STUDIO_LIST_LIMIT = 200;

	private static final Map<String, String> EXTENSIONS = Map.of(
			"audio/mpeg", "mp3",
			"audio/mp4", "m4a",
			"audio/x-m4a", "m4a",
			"audio/aac", "aac",
			"audio/ogg", "ogg");

	private final EpisodeRepository episodes;
	private final ShowService showService;
	private final MediaStorage storage;
	private final Clock clock;

	public EpisodeService(EpisodeRepository episodes, ShowService showService, MediaStorage storage, Clock clock) {
		this.episodes = episodes;
		this.showService = showService;
		this.storage = storage;
		this.clock = clock;
	}

	@Transactional
	public EpisodeView create(EpisodeCommands.CreateEpisode command) {
		showService.requireOwned(command.showId(), command.userId());
		if (episodes.countByShowId(command.showId()) >= MAX_EPISODES_PER_SHOW) {
			throw RpcException.conflict("A show can have at most " + MAX_EPISODES_PER_SHOW + " episodes");
		}
		return toView(episodes.save(Episode.create(command, Timestamps.now(clock))));
	}

	@Transactional(readOnly = true)
	public List<EpisodeView> list(ShowCommands.ShowRef command) {
		showService.requireOwned(command.showId(), command.userId());
		return episodes.findByShowIdOrderByCreatedAtDesc(command.showId(), Limit.of(STUDIO_LIST_LIMIT))
				.stream()
				.map(this::toView)
				.toList();
	}

	@Transactional(readOnly = true)
	public EpisodeView get(EpisodeCommands.EpisodeRef command) {
		return toView(requireOwned(command.episodeId(), command.userId()));
	}

	@Transactional
	public MediaStorage.PresignedUpload requestUpload(EpisodeCommands.RequestUpload command) {
		if (command.sizeBytes() > storage.maxUploadBytes()) {
			throw RpcException.badRequest("sizeBytes must not exceed " + storage.maxUploadBytes());
		}
		var episode = requireOwned(command.episodeId(), command.userId());
		var key = "shows/%s/episodes/%s/%s.%s".formatted(
				episode.getShowId(), episode.getId(), UUID.randomUUID(), EXTENSIONS.get(command.contentType()));
		episode.startUpload(key, command.contentType(), Timestamps.now(clock));
		return storage.presignUpload(key, command.contentType(), command.sizeBytes());
	}

	@Transactional
	public EpisodeView completeUpload(EpisodeCommands.CompleteUpload command) {
		var episode = requireOwned(command.episodeId(), command.userId());
		if (episode.getPendingMediaKey() == null) {
			throw RpcException.conflict("No upload was requested for this episode");
		}
		var stored = storage.head(episode.getPendingMediaKey())
				.orElseThrow(() -> RpcException.conflict("Uploaded file was not found"));
		if (stored.sizeBytes() <= 0 || stored.sizeBytes() > storage.maxUploadBytes()) {
			throw RpcException.badRequest("Uploaded file size is not allowed");
		}
		if (!episode.getPendingMediaType().equals(stored.contentType())) {
			throw RpcException.badRequest("Uploaded file type does not match the requested type");
		}
		episode.attachUploadedMedia(stored.sizeBytes(), command.durationSeconds(), Timestamps.now(clock));
		return toView(episode);
	}

	@Transactional
	public EpisodeView publish(EpisodeCommands.EpisodeRef command) {
		var episode = requireOwned(command.episodeId(), command.userId());
		if (!episode.hasMedia()) {
			throw RpcException.conflict("Upload audio before publishing");
		}
		var now = Timestamps.now(clock);
		episode.publish(now);
		var show = showService.requireOwned(episode.getShowId(), command.userId());
		show.publish(now);
		showService.notifyCatalog(show);
		return toView(episode);
	}

	private Episode requireOwned(UUID episodeId, UUID ownerId) {
		return episodes.findOwned(episodeId, ownerId)
				.orElseThrow(() -> RpcException.notFound("Episode " + episodeId + " not found"));
	}

	private EpisodeView toView(Episode episode) {
		return new EpisodeView(
				episode.getId(),
				episode.getShowId(),
				episode.getTitle(),
				episode.getDescription(),
				episode.getEpisodeType().name(),
				episode.getSeasonNumber(),
				episode.getEpisodeNumber(),
				episode.isExplicit(),
				episode.getStatus().name(),
				storage.publicUrl(episode.getMediaKey()),
				episode.getMediaContentType(),
				episode.getMediaSizeBytes(),
				episode.getDurationSeconds(),
				Timestamps.iso(episode.getPublishedAt()),
				Timestamps.iso(episode.getCreatedAt()),
				Timestamps.iso(episode.getUpdatedAt()));
	}
}
