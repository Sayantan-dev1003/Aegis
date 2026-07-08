package kafka

import (
	"strings"

	kafka "github.com/segmentio/kafka-go"
)

// KafkaHeaderCarrier implements propagation.TextMapCarrier for Kafka headers
type KafkaHeaderCarrier struct {
	Headers *[]kafka.Header
}

// Get returns the value associated with the passed key
func (c KafkaHeaderCarrier) Get(key string) string {
	for _, h := range *c.Headers {
		if strings.EqualFold(h.Key, key) {
			return string(h.Value)
		}
	}
	return ""
}

// Set stores the key-value pair
func (c KafkaHeaderCarrier) Set(key string, value string) {
	*c.Headers = append(*c.Headers, kafka.Header{Key: key, Value: []byte(value)})
}

// Keys lists the keys stored in this carrier
func (c KafkaHeaderCarrier) Keys() []string {
	keys := make([]string, len(*c.Headers))
	for i, h := range *c.Headers {
		keys[i] = h.Key
	}
	return keys
}
