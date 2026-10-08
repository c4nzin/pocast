using Pocast.Library.Configuration;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace Pocast.Library.Rpc;

public sealed class RabbitRpcServer(
    LibrarySettings settings,
    RpcRouter router,
    ILogger<RabbitRpcServer> logger) : BackgroundService
{
    private static readonly TimeSpan ConnectRetryDelay = TimeSpan.FromSeconds(2);

    private IConnection? connection;
    private IChannel? consumeChannel;
    private IChannel? replyChannel;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        connection = await ConnectAsync(stoppingToken);
        consumeChannel = await connection.CreateChannelAsync(
            new CreateChannelOptions(false, false, consumerDispatchConcurrency: settings.Concurrency),
            stoppingToken);
        replyChannel = await connection.CreateChannelAsync(cancellationToken: stoppingToken);

        await consumeChannel.QueueDeclareAsync(
            settings.Queue, durable: true, exclusive: false, autoDelete: false, cancellationToken: stoppingToken);
        await consumeChannel.BasicQosAsync(0, settings.Prefetch, false, stoppingToken);

        var consumer = new AsyncEventingBasicConsumer(consumeChannel);
        consumer.ReceivedAsync += (_, delivery) => HandleAsync(delivery, stoppingToken);
        await consumeChannel.BasicConsumeAsync(settings.Queue, autoAck: false, consumer, stoppingToken);

        logger.LogInformation("library-service listening on queue \"{Queue}\"", settings.Queue);
    }

    private async Task HandleAsync(BasicDeliverEventArgs delivery, CancellationToken stoppingToken)
    {
        var reply = await router.DispatchAsync(delivery.Body, stoppingToken);
        var replyTo = delivery.BasicProperties.ReplyTo;
        if (!string.IsNullOrEmpty(replyTo))
        {
            var properties = new BasicProperties { CorrelationId = delivery.BasicProperties.CorrelationId };
            await replyChannel!.BasicPublishAsync(string.Empty, replyTo, false, properties, reply, stoppingToken);
        }
        await consumeChannel!.BasicAckAsync(delivery.DeliveryTag, false, stoppingToken);
    }

    private async Task<IConnection> ConnectAsync(CancellationToken stoppingToken)
    {
        var factory = new ConnectionFactory
        {
            Uri = new Uri(settings.RabbitMqUrl),
            AutomaticRecoveryEnabled = true,
            TopologyRecoveryEnabled = true,
            ClientProvidedName = "library-service",
        };
        while (true)
        {
            try
            {
                return await factory.CreateConnectionAsync(stoppingToken);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                logger.LogWarning("RabbitMQ unavailable ({Reason}), retrying", error.Message);
                await Task.Delay(ConnectRetryDelay, stoppingToken);
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        if (consumeChannel is not null) await consumeChannel.CloseAsync(cancellationToken);
        await base.StopAsync(cancellationToken);
        if (replyChannel is not null) await replyChannel.CloseAsync(cancellationToken);
        if (connection is not null) await connection.CloseAsync(cancellationToken);
    }
}
