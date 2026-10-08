package app.pocast.creator.rpc;

import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class RpcListener {

	private final RpcRouter router;

	public RpcListener(RpcRouter router) {
		this.router = router;
	}

	@RabbitListener(queues = "${pocast.creator.queue}")
	public Message handle(Message request) {
		return MessageBuilder.withBody(router.dispatch(request.getBody()))
				.setContentType(MessageProperties.CONTENT_TYPE_JSON)
				.setCorrelationId(request.getMessageProperties().getCorrelationId())
				.build();
	}
}
