package app.pocast.creator.config;

import app.pocast.creator.episodes.EpisodeCommands;
import app.pocast.creator.episodes.EpisodeService;
import app.pocast.creator.feed.FeedService;
import app.pocast.creator.rpc.CommandReader;
import app.pocast.creator.rpc.RpcHandler;
import app.pocast.creator.rpc.RpcRouter;
import app.pocast.creator.shows.ShowCommands;
import app.pocast.creator.shows.ShowService;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class RpcConfig {

	@Bean
	RpcRouter rpcRouter(CommandReader reader, ShowService shows, EpisodeService episodes, FeedService feeds) {
		return new RpcRouter(Map.<String, RpcHandler>ofEntries(
				Map.entry("creator.show.create", data -> shows.create(reader.read(data, ShowCommands.CreateShow.class))),
				Map.entry("creator.show.update", data -> shows.update(reader.read(data, ShowCommands.UpdateShow.class))),
				Map.entry("creator.show.get", data -> shows.get(reader.read(data, ShowCommands.ShowRef.class))),
				Map.entry("creator.show.list", data -> shows.list(reader.read(data, ShowCommands.UserCommand.class))),
				Map.entry("creator.episode.create",
						data -> episodes.create(reader.read(data, EpisodeCommands.CreateEpisode.class))),
				Map.entry("creator.episode.list", data -> episodes.list(reader.read(data, ShowCommands.ShowRef.class))),
				Map.entry("creator.episode.get", data -> episodes.get(reader.read(data, EpisodeCommands.EpisodeRef.class))),
				Map.entry("creator.episode.publish",
						data -> episodes.publish(reader.read(data, EpisodeCommands.EpisodeRef.class))),
				Map.entry("creator.media.upload.request",
						data -> episodes.requestUpload(reader.read(data, EpisodeCommands.RequestUpload.class))),
				Map.entry("creator.media.upload.complete",
						data -> episodes.completeUpload(reader.read(data, EpisodeCommands.CompleteUpload.class))),
				Map.entry("creator.feed.get", data -> feeds.render(reader.read(data, FeedService.FeedRequest.class)))));
	}
}
