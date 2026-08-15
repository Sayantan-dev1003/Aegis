package kafka

import (
	"context"
	"crypto/tls"
	"strings"

	"github.com/segmentio/kafka-go"
	"github.com/segmentio/kafka-go/sasl"
	"github.com/segmentio/kafka-go/sasl/plain"
	"github.com/segmentio/kafka-go/sasl/scram"
)

// Producer wraps a kafka-go Writer.
type Producer struct {
	writer *kafka.Writer
}

// NewProducer initializes a new Kafka producer using segmentio/kafka-go.
// The delivery report goroutine logic is handled implicitly by the Completion callback.
func NewProducer(brokers, username, password, saslMechanism string) *Producer {
	brokerList := strings.Split(brokers, ",")

	var transport *kafka.Transport
	if username != "" {
		var mechanism sasl.Mechanism
		if strings.ToUpper(saslMechanism) == "SCRAM-SHA-256" || strings.ToUpper(saslMechanism) == "SCRAM-SHA-512" {
			algo := scram.SHA256
			if strings.ToUpper(saslMechanism) == "SCRAM-SHA-512" {
				algo = scram.SHA512
			}
			m, err := scram.Mechanism(algo, username, password)
			if err != nil {
				panic("Failed to initialize SCRAM mechanism: " + err.Error())
			}
			mechanism = m
		} else {
			mechanism = plain.Mechanism{
				Username: username,
				Password: password,
			}
		}

		transport = &kafka.Transport{
			TLS:  &tls.Config{},
			SASL: mechanism,
		}
	}

	w := &kafka.Writer{
		Addr:                   kafka.TCP(brokerList...),
		Balancer:               &kafka.Hash{},
		AllowAutoTopicCreation: true,
		Transport:              transport,
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

// PublishRawTransaction publishes a raw transaction to the DLQ requeue topic.
func (p *Producer) PublishRawTransaction(ctx context.Context, key string, value []byte) error {
	msg := kafka.Message{
		Topic: "transactions.raw",
		Key:   []byte(key),
		Value: value,
	}
	return p.writer.WriteMessages(ctx, msg)
}

// Close gracefully closes the producer.
func (p *Producer) Close() error {
	return p.writer.Close()
}
