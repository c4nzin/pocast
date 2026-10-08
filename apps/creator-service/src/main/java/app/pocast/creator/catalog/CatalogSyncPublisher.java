package app.pocast.creator.catalog;

import app.pocast.creator.config.CreatorProperties;
import app.pocast.creator.rpc.RpcJson;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class CatalogSyncPublisher {

	public static final String HOSTED_SYNC_PATTERN = "catalog.hosted.sync";

	private static final Logger LOGGER = LoggerFactory.getLogger(CatalogSyncPublisher.class);

	private final RabbitTemplate rabbit;
	private final String queue;

	public CatalogSyncPublisher(RabbitTemplate rabbit, CreatorProperties properties) {
		this.rabbit = rabbit;
		this.queue = properties.catalogIngestQueue();
	}

	public record ShowChanged(UUID showId, String feedUrl) {
	}

	@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
	public void onShowChanged(ShowChanged event) {
		var body = RpcJson.mapper().writeValueAsBytes(Map.of(
				"pattern", HOSTED_SYNC_PATTERN,
				"data", Map.of("showId", event.showId().toString(), "feedUrl", event.feedUrl())));
		var message = MessageBuilder.withBody(body)
				.setContentType(MessageProperties.CONTENT_TYPE_JSON)
				.setDeliveryMode(MessageDeliveryMode.PERSISTENT)
				.build();
		try {
			rabbit.send("", queue, message);
		}
		catch (AmqpException error) {
			LOGGER.error("Could not notify catalog about show {}", event.showId(), error);
		}
	}
}
