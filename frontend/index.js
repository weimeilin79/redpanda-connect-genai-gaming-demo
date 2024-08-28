const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Kafka } = require('kafkajs');


const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const brokers = process.env.REDPANDA_BROKERS ? process.env.REDPANDA_BROKERS.split(',') : ['localhost:19092'];
//const saslMechanism = process.env.REDPANDA_SASL_MECHANISM || 'SCRAM-SHA-256';
//const username = process.env.REDPANDA_USERNAME || 'workshop';
//const password = process.env.REDPANDA_PASSWORD || '1234qwer';

const kafka = new Kafka({
    clientId: 'rpg-frontend',
    brokers: brokers,
//    ssl: {},
//    sasl: {
//        mechanism: saslMechanism,
//        username: username,
//        password: password
//    }
});
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'rpg-group' });
const bonusConsumer = kafka.consumer({ groupId: 'bonus-group' });

const setupKafka = async () => {
    await producer.connect();
    await consumer.connect();
    await bonusConsumer.connect();
    await consumer.subscribe({ topic: 'rpg-response' });
    await bonusConsumer.subscribe({ topic: 'bonus' });

    consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const value = message.value.toString();  // Convert buffer to string
          const jsonData = JSON.parse(value);  // Parse JSON string to an object
          io.emit('receive-message', jsonData);  // Emit as a JavaScript object
        },
      });

    bonusConsumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const value = message.value.toString();  
          const jsonData = JSON.parse(value);  
          io.emit('bonus-message', jsonData);  
        },
    });
  };

  setupKafka();

  io.on('connection', (socket) => {
    socket.on('send-message', async (data) => {
      //io.emit('receive-message', data); 
      await producer.send({
        topic: 'npc-request',
        messages: [
          { value: JSON.stringify(data) }
        ],
      });
    });
});

app.use(express.static('public'));

server.listen(80, () => {
  console.log('Server running on http://localhost');
});
