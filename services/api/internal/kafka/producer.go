package kafka

import (
	"context"
	"strings"

	"github.com/segmentio/kafka-go"
)

// Producer wraps a kafka-go Writer.
type Producer struct {
	writer *kafka.Writer
}

// NewProducer initializes a new Kafka producer using segmentio/kafka-go.
// The delivery report goroutine logic is handled implicitly by the Completion callback.
func NewProducer(brokers string) *Producer {
	brokerList := strings.Split(brokers, ",")

	w := &kafka.Writer{
		Addr:                   kafka.TCP(brokerList...),
		Balancer:               &kafka.Hash{},
		AllowAutoTopicCreation: true,
		// Using synchronous writes so we can guarantee delivery before marking as published in the DB.
	}

	return &Producer{writer: w}
}

// Produce publishes a message to the specified topic.
// With Async=true, this returns immediately and delivery is handled asynchronously.
func (p *Producer) Produce(ctx context.Context, topic string, key []byte, value []byte, headers map[string]string) error {
	var kafkaHeaders []kafka.Header
	for k, v := range headers {
		kafkaHeaders = append(kafkaHeaders, kafka.Header{Key: k, Value: []byte(v)})
	}

	msg := kafka.Message{
		Topic:   topic,
		Key:     key,
		Value:   value,
		Headers: kafkaHeaders,
	}

	return p.writer.WriteMessages(ctx, msg)
}

// Close gracefully closes the producer.
func (p *Producer) Close() error {
	return p.writer.Close()
}
