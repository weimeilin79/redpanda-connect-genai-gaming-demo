// npcs/npc3.js
const { Kafka } = require('kafkajs');

const brokers = process.env.REDPANDA_BROKERS ? process.env.REDPANDA_BROKERS.split(',') : ['localhost:19092'];
const saslMechanism = process.env.REDPANDA_SASL_MECHANISM || 'SCRAM-SHA-256';
const username = process.env.REDPANDA_USERNAME || '';
const password = process.env.REDPANDA_PASSWORD || '';

const kafka = new Kafka({
    clientId: 'npc3',
    brokers: brokers,
    ssl: {},
    sasl: {
        mechanism: saslMechanism,
        username: username,
        password: password
    }
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'npc3-group' });

module.exports = function (io) {
  const setupKafka = async () => {
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({ topic: 'npc3-response' });

    consumer.run({
      eachMessage: async ({ message }) => {
        io.emit('npc3-response', message.value.toString());
      },
    });
  };

  setupKafka();

  io.on('connection', (socket) => {
    socket.on('npc3-message', async (data) => {
      await producer.send({
        topic: 'npc3-request',
        messages: [
          { value: data.message }
        ],
      });
    });
  });
};
